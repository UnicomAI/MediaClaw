import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  RemoteDesktopConnectionState,
  RemoteDesktopSession,
  RemoteDesktopConfig,
  RemoteDesktopSSEEvent,
} from '@/api/types'
import { useAuthStore } from './auth'

export const useRemoteDesktopStore = defineStore('remoteDesktop', () => {
  const connectionState = ref<RemoteDesktopConnectionState>('disconnected')
  const currentSession = ref<RemoteDesktopSession | null>(null)
  const sessions = ref<RemoteDesktopSession[]>([])
  const config = ref<RemoteDesktopConfig>({
    width: 1024,
    height: 768,
    depth: 24,
    compression: 6,
    quality: 9,
    timeout: 300,
    shared: false,
    viewOnly: false,
    scale: true,
  })
  const error = ref<string | null>(null)
  const eventSource = ref<EventSource | null>(null)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10
  const reconnectDelay = ref(1000)
  const reconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimer = ref<ReturnType<typeof setInterval> | null>(null)

  const isConnected = computed(() => connectionState.value === 'connected')
  const isConnecting = computed(() => connectionState.value === 'connecting')
  const hasError = computed(() => connectionState.value === 'error')

  function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const authStore = useAuthStore()
    const token = authStore.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  function setConfig(newConfig: Partial<RemoteDesktopConfig>) {
    config.value = { ...config.value, ...newConfig }
  }

  function setSessions(newSessions: RemoteDesktopSession[]) {
    sessions.value = newSessions
  }

  function addSession(session: RemoteDesktopSession) {
    const existingIndex = sessions.value.findIndex((s) => s.id === session.id)
    if (existingIndex >= 0) {
      sessions.value[existingIndex] = session
    } else {
      sessions.value.push(session)
    }
  }

  function removeSession(sessionId: string) {
    sessions.value = sessions.value.filter((s) => s.id !== sessionId)
    if (currentSession.value?.id === sessionId) {
      currentSession.value = null
    }
  }

  function updateSession(sessionId: string, updates: Partial<RemoteDesktopSession>) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (session) {
      Object.assign(session, updates)
    }
    if (currentSession.value?.id === sessionId) {
      Object.assign(currentSession.value, updates)
    }
  }

  async function createSession(nodeId?: string, width?: number, height?: number, display?: string): Promise<RemoteDesktopSession | null> {
    try {
      const response = await fetch('/api/desktop/create', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          nodeId,
          width: width || config.value.width,
          height: height || config.value.height,
          display,
        }),
      })

      const result = await response.json()

      if (result.ok) {
        const newSession: RemoteDesktopSession = {
          id: result.sessionId,
          nodeId: nodeId || 'local',
          nodeName: nodeId || 'local',
          platform: result.platform || 'unknown',
          status: 'creating',
          width: result.width || width || config.value.width,
          height: result.height || height || config.value.height,
          depth: config.value.depth || 24,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
        }
        addSession(newSession)
        return newSession
      }
      throw new Error(result.error?.message || result.message || 'Failed to create desktop session')
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create desktop session'
      return null
    }
  }

  async function destroySession(sessionId?: string): Promise<boolean> {
    const targetSessionId = sessionId || currentSession.value?.id
    if (!targetSessionId) {
      return false
    }

    try {
      const response = await fetch('/api/desktop/destroy', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ sessionId: targetSessionId }),
      })

      const result = await response.json()
      
      if (result.ok) {
        if (currentSession.value?.id === targetSessionId) {
          disconnect()
        }
        removeSession(targetSessionId)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function loadSessions(): Promise<void> {
    try {
      const response = await fetch('/api/desktop/list', {
        headers: getHeaders(),
      })
      const result = await response.json()
      if (result.ok && result.sessions) {
        setSessions(result.sessions)
      }
    } catch {
      sessions.value = []
    }
  }

  function connect(sessionId: string): void {
    if (eventSource.value) {
      disconnect()
    }

    connectionState.value = 'connecting'
    error.value = null

    const session = sessions.value.find((s) => s.id === sessionId)
    if (session) {
      currentSession.value = session
    }

    try {
      const authStore = useAuthStore()
      const token = authStore.getToken()
      let url = `/api/desktop/stream?sessionId=${sessionId}`
      if (token) {
        url += `&token=${token}`
      }

      eventSource.value = new EventSource(url)

      eventSource.value.onopen = () => {
        reconnectAttempts.value = 0
      }

      eventSource.value.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as RemoteDesktopSSEEvent
          handleSSEEvent(data)
        } catch {
          // Ignore parse errors
        }
      }

      eventSource.value.onerror = (e: Event) => {
        const es = e.target as EventSource
        if (es.readyState === EventSource.CLOSED) {
          connectionState.value = 'error'
          error.value = 'Connection closed'
          scheduleReconnect()
        } else if (es.readyState === EventSource.CONNECTING) {
          connectionState.value = 'connecting'
        }
      }
    } catch (e) {
      connectionState.value = 'error'
      error.value = e instanceof Error ? e.message : 'Connection failed'
    }
  }

  function handleSSEEvent(event: RemoteDesktopSSEEvent) {
    switch (event.type) {
      case 'connected':
        connectionState.value = 'connected'
        if (currentSession.value) {
          currentSession.value.status = 'connected'
          updateSession(currentSession.value.id, { status: 'connected' })
        }
        startHeartbeat()
        break

      case 'disconnected':
        connectionState.value = 'disconnected'
        if (currentSession.value) {
          currentSession.value.status = 'disconnected'
          updateSession(currentSession.value.id, { status: 'disconnected' })
        }
        stopHeartbeat()
        break

      case 'error':
        connectionState.value = 'error'
        error.value = event.message || 'Unknown error'
        if (currentSession.value) {
          updateSession(currentSession.value.id, { status: 'error', error: event.message })
        }
        break

      case 'resized':
        if (event.width && event.height && currentSession.value) {
          currentSession.value.width = event.width
          currentSession.value.height = event.height
          updateSession(currentSession.value.id, { width: event.width, height: event.height })
        }
        break

      case 'frame':
        if (event.data && currentSession.value) {
          currentSession.value.frameData = event.data
        }
        break
    }
  }

  function scheduleReconnect() {
    if (reconnectAttempts.value >= maxReconnectAttempts) {
      return
    }

    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value)
    }

    const delay = reconnectDelay.value * Math.pow(1.5, reconnectAttempts.value)
    reconnectAttempts.value++

    if (currentSession.value) {
      reconnectTimer.value = setTimeout(() => {
        connect(currentSession.value!.id)
      }, delay)
    }
  }

  function startHeartbeat() {
    stopHeartbeat()
    const interval = (config.value.timeout || 300) * 1000 / 2
    heartbeatTimer.value = setInterval(async () => {
      if (isConnected.value && currentSession.value) {
        try {
          await fetch('/api/desktop/heartbeat', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
              sessionId: currentSession.value.id,
            }),
          })
        } catch {
          // Ignore heartbeat errors
        }
      }
    }, interval)
  }

  function stopHeartbeat() {
    if (heartbeatTimer.value) {
      clearInterval(heartbeatTimer.value)
      heartbeatTimer.value = null
    }
  }

  function disconnect() {
    stopHeartbeat()
    if (reconnectTimer.value) {
      clearTimeout(reconnectTimer.value)
      reconnectTimer.value = null
    }

    if (eventSource.value) {
      eventSource.value.close()
      eventSource.value = null
    }

    connectionState.value = 'disconnected'
    reconnectAttempts.value = 0
  }

  async function sendMouseEvent(event: MouseEvent): Promise<boolean> {
    if (!isConnected.value || !currentSession.value) {
      return false
    }

    try {
      const response = await fetch('/api/desktop/input/mouse', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          sessionId: currentSession.value.id,
          x: event.offsetX,
          y: event.offsetY,
          buttons: event.buttons,
          type: event.type,
        }),
      })

      return response.ok
    } catch {
      return false
    }
  }

  async function sendKeyboardEvent(event: KeyboardEvent): Promise<boolean> {
    if (!isConnected.value || !currentSession.value) {
      return false
    }

    try {
      const response = await fetch('/api/desktop/input/keyboard', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          sessionId: currentSession.value.id,
          key: event.key,
          code: event.code,
          keyCode: event.keyCode,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          type: event.type,
        }),
      })

      return response.ok
    } catch {
      return false
    }
  }

  async function sendClipboardText(text: string): Promise<boolean> {
    if (!isConnected.value || !currentSession.value) {
      return false
    }

    try {
      const response = await fetch('/api/desktop/input/clipboard', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          sessionId: currentSession.value.id,
          text,
        }),
      })

      return response.ok
    } catch {
      return false
    }
  }

  async function resize(width: number, height: number): Promise<boolean> {
    if (!isConnected.value || !currentSession.value) {
      return false
    }

    try {
      const response = await fetch('/api/desktop/resize', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          sessionId: currentSession.value.id,
          width,
          height,
        }),
      })

      const result = await response.json()

      if (result.ok) {
        config.value.width = width
        config.value.height = height
        return true
      }
      return false
    } catch {
      return false
    }
  }

  return {
    connectionState,
    currentSession,
    sessions,
    config,
    error,
    isConnected,
    isConnecting,
    hasError,
    setConfig,
    setSessions,
    addSession,
    removeSession,
    updateSession,
    createSession,
    destroySession,
    loadSessions,
    connect,
    disconnect,
    sendMouseEvent,
    sendKeyboardEvent,
    sendClipboardText,
    resize,
  }
})
