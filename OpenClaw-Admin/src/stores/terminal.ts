import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  TerminalConnectionState,
  TerminalSession,
  TerminalConfig,
  TerminalSSEEvent,
} from '@/api/types'
import { useAuthStore } from './auth'

export const useTerminalStore = defineStore('terminal', () => {
  const connectionState = ref<TerminalConnectionState>('disconnected')
  const currentSession = ref<TerminalSession | null>(null)
  const config = ref<TerminalConfig>({
    cols: 80,
    rows: 24,
    timeout: 60,
  })
  const error = ref<string | null>(null)
  const eventSource = ref<EventSource | null>(null)
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = 10
  const reconnectDelay = ref(1000)
  const reconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimer = ref<ReturnType<typeof setInterval> | null>(null)
  const outputCallback = ref<((data: string) => void) | null>(null)
  const connectedCallback = ref<((sessionId: string) => void) | null>(null)
  const disconnectedCallback = ref<(() => void) | null>(null)

  const isConnected = computed(() => connectionState.value === 'connected')
  const isConnecting = computed(() => connectionState.value === 'connecting')
  const hasError = computed(() => connectionState.value === 'error')

  function setConfig(newConfig: Partial<TerminalConfig>) {
    config.value = { ...config.value, ...newConfig }
  }

  function onOutput(callback: (data: string) => void) {
    outputCallback.value = callback
  }

  function onConnected(callback: (sessionId: string) => void) {
    connectedCallback.value = callback
  }

  function onDisconnected(callback: () => void) {
    disconnectedCallback.value = callback
  }

  function connect(nodeId?: string) {
    if (eventSource.value) {
      disconnect()
    }

    connectionState.value = 'connecting'
    error.value = null
    config.value.nodeId = nodeId

    try {
      const baseUrl = window.location.origin
      let url = `${baseUrl}/api/terminal/stream`
      const params = new URLSearchParams()
      
      const authStore = useAuthStore()
      const token = authStore.getToken()
      if (token) {
        params.append('token', token)
      }
      
      if (nodeId) {
        params.append('nodeId', nodeId)
      }
      params.append('cols', String(config.value.cols))
      params.append('rows', String(config.value.rows))
      if (config.value.cwd) {
        params.append('cwd', config.value.cwd)
      }
      if (config.value.shell) {
        params.append('shell', config.value.shell)
      }
      if (config.value.timeout) {
        params.append('timeout', String(config.value.timeout))
      }
      url += `?${params.toString()}`

      eventSource.value = new EventSource(url)

      eventSource.value.onopen = () => {
        reconnectAttempts.value = 0
      }

      eventSource.value.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as TerminalSSEEvent
          handleSSEEvent(data)
        } catch {
          if (outputCallback.value && event.data) {
            outputCallback.value(event.data)
          }
        }
      }

      eventSource.value.onerror = (e: Event) => {
        const es = e.target as EventSource
        if (es.readyState === EventSource.CLOSED) {
          connectionState.value = 'error'
          error.value = 'Connection closed'
          if (disconnectedCallback.value) {
            disconnectedCallback.value()
          }
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

  function handleSSEEvent(event: TerminalSSEEvent) {
    switch (event.type) {
      case 'connected':
        connectionState.value = 'connected'
        currentSession.value = {
          id: event.sessionId,
          nodeId: config.value.nodeId,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
        }
        startHeartbeat()
        if (connectedCallback.value) {
          connectedCallback.value(event.sessionId)
        }
        break

      case 'output':
        if (event.data && outputCallback.value) {
          outputCallback.value(event.data)
        }
        if (currentSession.value) {
          currentSession.value.lastActivityAt = Date.now()
        }
        break

      case 'error':
        error.value = event.message || 'Unknown error'
        break

      case 'disconnected':
        connectionState.value = 'disconnected'
        if (disconnectedCallback.value) {
          disconnectedCallback.value()
        }
        break

      case 'resized':
        if (event.cols && event.rows) {
          config.value.cols = event.cols
          config.value.rows = event.rows
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

    reconnectTimer.value = setTimeout(() => {
      connect(config.value.nodeId)
    }, delay)
  }

  function startHeartbeat() {
    stopHeartbeat()
    const interval = (config.value.timeout || 60) * 1000 / 2
    heartbeatTimer.value = setInterval(async () => {
      if (isConnected.value && currentSession.value) {
        try {
          const authStore = useAuthStore()
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          }
          const token = authStore.getToken()
          if (token) {
            headers['Authorization'] = `Bearer ${token}`
          }
          await fetch('/api/terminal/heartbeat', {
            method: 'POST',
            headers,
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
    currentSession.value = null
    reconnectAttempts.value = 0
  }

  async function sendInput(input: string): Promise<boolean> {
    if (!isConnected.value || !currentSession.value) {
      return false
    }

    try {
      const authStore = useAuthStore()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      const token = authStore.getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch('/api/terminal/input', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: currentSession.value.id,
          data: input,
        }),
      })

      return response.ok
    } catch {
      return false
    }
  }

  async function resize(cols: number, rows: number): Promise<boolean> {
    if (!isConnected.value || !currentSession.value) {
      return false
    }

    try {
      const authStore = useAuthStore()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      const token = authStore.getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch('/api/terminal/resize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: currentSession.value.id,
          cols,
          rows,
        }),
      })

      if (response.ok) {
        config.value.cols = cols
        config.value.rows = rows
      }

      return response.ok
    } catch {
      return false
    }
  }

  async function destroySession(sessionId?: string): Promise<boolean> {
    const targetSessionId = sessionId || currentSession.value?.id
    if (!targetSessionId) {
      return false
    }

    try {
      const authStore = useAuthStore()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      const token = authStore.getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch('/api/terminal/destroy', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: targetSessionId,
        }),
      })

      if (response.ok && currentSession.value?.id === targetSessionId) {
        disconnect()
      }

      return response.ok
    } catch {
      return false
    }
  }

  return {
    connectionState,
    currentSession,
    config,
    error,
    isConnected,
    isConnecting,
    hasError,
    setConfig,
    onOutput,
    onConnected,
    onDisconnected,
    connect,
    disconnect,
    sendInput,
    resize,
    destroySession,
  }
})
