import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './auth'

export interface HermesCliSession {
  id: string
  cols: number
  rows: number
  name?: string
}

export interface HermesCliSessionInfo {
  id: string
  name: string | null
  args: string[]
  createdAt: number
  lastHeartbeat: number
  status: 'running' | 'connected' | 'exited'
}

interface HermesCliSSEEvent {
  type: 'output' | 'connected' | 'disconnected' | 'error'
  sessionId: string
  data?: string
  cols?: number
  rows?: number
  message?: string
  reconnect?: boolean
  name?: string
}

export const useHermesCliStore = defineStore('hermesCli', () => {
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const currentSession = ref<HermesCliSession | null>(null)
  const error = ref<string | null>(null)
  const eventSource = ref<EventSource | null>(null)
  const heartbeatTimer = ref<ReturnType<typeof setInterval> | null>(null)
  const outputCallback = ref<((data: string) => void) | null>(null)
  const connectedCallback = ref<((sessionId: string) => void) | null>(null)
  const disconnectedCallback = ref<(() => void) | null>(null)
  const sessions = ref<HermesCliSessionInfo[]>([])
  const isReconnect = ref(false)

  function onOutput(callback: (data: string) => void) {
    outputCallback.value = callback
  }

  function onConnected(callback: (sessionId: string) => void) {
    connectedCallback.value = callback
  }

  function onDisconnected(callback: () => void) {
    disconnectedCallback.value = callback
  }

  function startHeartbeat() {
    stopHeartbeat()
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
          await fetch('/api/hermes-cli/heartbeat', {
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
    }, 30000)
  }

  function stopHeartbeat() {
    if (heartbeatTimer.value) {
      clearInterval(heartbeatTimer.value)
      heartbeatTimer.value = null
    }
  }

  async function fetchSessions(): Promise<HermesCliSessionInfo[]> {
    try {
      const authStore = useAuthStore()
      const headers: Record<string, string> = {}
      const token = authStore.getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch('/api/hermes-cli/sessions', { headers })
      if (response.ok) {
        const data = await response.json()
        sessions.value = data.sessions || []
        return sessions.value
      }
    } catch {
      // Ignore fetch errors
    }
    return []
  }

  function connect(cols = 120, rows = 36, sessionId?: string): Promise<void> {
    if (eventSource.value) {
      disconnect()
    }

    isConnecting.value = true
    isConnected.value = false
    isReconnect.value = !!sessionId
    error.value = null

    return new Promise<void>((resolve, reject) => {
      try {
        const baseUrl = window.location.origin
        const params = new URLSearchParams()

        const authStore = useAuthStore()
        const token = authStore.getToken()
        if (token) {
          params.append('token', token)
        }

        params.append('cols', String(cols))
        params.append('rows', String(rows))

        if (sessionId) {
          params.append('sessionId', sessionId)
        }

        const url = `${baseUrl}/api/hermes-cli/stream?${params.toString()}`

        eventSource.value = new EventSource(url)

        eventSource.value.onopen = () => {
          // SSE connection opened, waiting for 'connected' event
        }

        eventSource.value.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as HermesCliSSEEvent
            handleSSEEvent(data, resolve)
          } catch {
            if (outputCallback.value && event.data) {
              outputCallback.value(event.data)
            }
          }
        }

        eventSource.value.onerror = () => {
          const es = eventSource.value
          if (es && es.readyState === EventSource.CLOSED) {
            isConnecting.value = false
            isConnected.value = false
            error.value = 'Connection closed'
            if (disconnectedCallback.value) {
              disconnectedCallback.value()
            }
            reject(new Error('Connection closed'))
          } else if (es && es.readyState === EventSource.CONNECTING) {
            isConnecting.value = true
          }
        }
      } catch (e) {
        isConnecting.value = false
        isConnected.value = false
        error.value = e instanceof Error ? e.message : 'Connection failed'
        reject(e)
      }
    })
  }

  function connectNew(args: string[], cols = 120, rows = 36): Promise<void> {
    if (eventSource.value) {
      disconnect()
    }

    isConnecting.value = true
    isConnected.value = false
    isReconnect.value = false
    error.value = null

    return new Promise<void>((resolve, reject) => {
      try {
        const baseUrl = window.location.origin
        const params = new URLSearchParams()

        const authStore = useAuthStore()
        const token = authStore.getToken()
        if (token) {
          params.append('token', token)
        }

        params.append('cols', String(cols))
        params.append('rows', String(rows))

        if (args.length > 0) {
          params.append('args', args.join(' '))
        }

        const url = `${baseUrl}/api/hermes-cli/stream?${params.toString()}`

        eventSource.value = new EventSource(url)

        eventSource.value.onopen = () => {
          // SSE connection opened, waiting for 'connected' event
        }

        eventSource.value.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as HermesCliSSEEvent
            handleSSEEvent(data, resolve)
          } catch {
            if (outputCallback.value && event.data) {
              outputCallback.value(event.data)
            }
          }
        }

        eventSource.value.onerror = () => {
          const es = eventSource.value
          if (es && es.readyState === EventSource.CLOSED) {
            isConnecting.value = false
            isConnected.value = false
            error.value = 'Connection closed'
            if (disconnectedCallback.value) {
              disconnectedCallback.value()
            }
            reject(new Error('Connection closed'))
          } else if (es && es.readyState === EventSource.CONNECTING) {
            isConnecting.value = true
          }
        }
      } catch (e) {
        isConnecting.value = false
        isConnected.value = false
        error.value = e instanceof Error ? e.message : 'Connection failed'
        reject(e)
      }
    })
  }

  function handleSSEEvent(event: HermesCliSSEEvent, connectResolve?: (value: void) => void) {
    switch (event.type) {
      case 'connected':
        isConnecting.value = false
        isConnected.value = true
        currentSession.value = {
          id: event.sessionId,
          cols: event.cols || 120,
          rows: event.rows || 36,
          name: event.name,
        }
        startHeartbeat()
        // Refresh session list after connect/reconnect
        fetchSessions()
        if (connectedCallback.value) {
          connectedCallback.value(event.sessionId)
        }
        if (connectResolve) {
          connectResolve()
        }
        break

      case 'output':
        if (event.data && outputCallback.value) {
          outputCallback.value(event.data)
        }
        break

      case 'error':
        error.value = event.message || 'Unknown error'
        break

      case 'disconnected':
        isConnecting.value = false
        isConnected.value = false
        // Refresh session list after disconnect
        fetchSessions()
        if (disconnectedCallback.value) {
          disconnectedCallback.value()
        }
        break
    }
  }

  function disconnect(): void {
    stopHeartbeat()

    if (eventSource.value) {
      eventSource.value.close()
      eventSource.value = null
    }

    isConnecting.value = false
    isConnected.value = false
    // Note: we do NOT clear currentSession so the user can still see which session they were connected to
    // and can reconnect. Only destroy() will clear it.
  }

  function detach(): void {
    // Alias for disconnect - just close SSE, process stays alive on server
    disconnect()
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

      const response = await fetch('/api/hermes-cli/input', {
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

      const response = await fetch('/api/hermes-cli/resize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: currentSession.value.id,
          cols,
          rows,
        }),
      })

      if (response.ok && currentSession.value) {
        currentSession.value.cols = cols
        currentSession.value.rows = rows
      }

      return response.ok
    } catch {
      return false
    }
  }

  async function destroy(): Promise<boolean> {
    if (!currentSession.value) {
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

      const response = await fetch('/api/hermes-cli/destroy', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: currentSession.value.id,
        }),
      })

      if (response.ok) {
        stopHeartbeat()
        if (eventSource.value) {
          eventSource.value.close()
          eventSource.value = null
        }
        isConnecting.value = false
        isConnected.value = false
        currentSession.value = null
      }

      // Refresh session list after destroy
      fetchSessions()

      return response.ok
    } catch {
      return false
    }
  }

  async function renameSession(sessionId: string, name: string): Promise<boolean> {
    try {
      const authStore = useAuthStore()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      const token = authStore.getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch('/api/hermes-cli/sessions/rename', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, name }),
      })

      if (response.ok) {
        // Update local session name if it's the current session
        if (currentSession.value && currentSession.value.id === sessionId) {
          currentSession.value.name = name
        }
        // Refresh session list
        fetchSessions()
      }

      return response.ok
    } catch {
      return false
    }
  }

  return {
    isConnected,
    isConnecting,
    isReconnect,
    currentSession,
    error,
    sessions,
    onOutput,
    onConnected,
    onDisconnected,
    connect,
    connectNew,
    disconnect,
    detach,
    sendInput,
    resize,
    destroy,
    fetchSessions,
    renameSession,
  }
})
