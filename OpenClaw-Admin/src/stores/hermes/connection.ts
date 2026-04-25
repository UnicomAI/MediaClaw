import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { HermesApiClient } from '@/api/hermes/client'
import type { HermesConnectionConfig, HermesStatus } from '@/api/hermes/types'

const STORAGE_KEY_GATEWAY = 'hermes_gateway'
const STORAGE_KEY_CONNECTION_CONFIG = 'hermes_connection_config'

function readStoredGateway(): 'openclaw' | 'hermes' {
  const raw = localStorage.getItem(STORAGE_KEY_GATEWAY)
  if (raw === 'hermes') return 'hermes'
  return 'openclaw'
}

function readStoredConnectionConfig(): HermesConnectionConfig {
  const raw = localStorage.getItem(STORAGE_KEY_CONNECTION_CONFIG)
  if (!raw) {
    return {
      webUrl: 'http://localhost:9119',
      apiUrl: 'http://localhost:8642',
      apiKey: '',
    }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HermesConnectionConfig>
    return {
      webUrl: parsed.webUrl || 'http://localhost:9119',
      apiUrl: parsed.apiUrl || 'http://localhost:8642',
      apiKey: parsed.apiKey || '',
    }
  } catch {
    return {
      webUrl: 'http://localhost:9119',
      apiUrl: 'http://localhost:8642',
      apiKey: '',
    }
  }
}

export const useHermesConnectionStore = defineStore('hermes-connection', () => {
  // ---- 状态 ----

  const currentGateway = ref<'openclaw' | 'hermes'>(readStoredGateway())
  const hermesConnected = ref(false)
  const hermesConnecting = ref(false)
  const hermesError = ref<string | null>(null)
  const connectionConfig = ref<HermesConnectionConfig>(readStoredConnectionConfig())
  const hermesStatus = ref<HermesStatus | null>(null)
  const initializedFromBackend = ref(false)
  const hasApiKeyFromEnv = ref(false) // 标记 API Key 是否从 .env 文件加载
  const autoStartDashboard = ref(false) // 是否自动启动 Dashboard
  const dashboardStatus = ref<{ running: boolean; pid: number | null; port: number | null; error: string | null }>({
    running: false,
    pid: null,
    port: null,
    error: null,
  })

  // ---- 内部 ----

  let client: HermesApiClient | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  const MAX_RECONNECT_ATTEMPTS = 10
  const RECONNECT_BASE_DELAY = 2000

  // 持久化网关选择
  watch(currentGateway, (val) => {
    localStorage.setItem(STORAGE_KEY_GATEWAY, val)
  })

  // 持久化连接配置
  watch(
    connectionConfig,
    (val) => {
      localStorage.setItem(STORAGE_KEY_CONNECTION_CONFIG, JSON.stringify(val))
    },
    { deep: true },
  )

  // 初始化：如果当前网关是 Hermes，自动加载配置
  if (currentGateway.value === 'hermes' && !initializedFromBackend.value) {
    loadConfigFromBackend()
  }

  // ---- 计算属性 ----

  function getClient(): HermesApiClient | null {
    if (!hermesConnected.value) return null
    return client
  }

  /**
   * 获取 Hermes API 客户端，如果未连接则自动等待连接完成。
   * 所有 store 的数据获取方法应优先使用此方法。
   */
  async function getClientAsync(): Promise<HermesApiClient> {
    if (!hermesConnected.value) {
      // 确保配置已加载
      if (!initializedFromBackend.value) {
        await loadConfigFromBackend()
      }
      await connect()
    }
    if (!hermesConnected.value) {
      throw new Error('Hermes 连接失败')
    }
    return client!
  }

  // ---- 方法 ----

  /**
   * 从后端加载连接配置（从 .env 文件读取）
   */
  async function loadConfigFromBackend(): Promise<void> {
    try {
      const response = await fetch('/api/hermes/connect')
      if (response.ok) {
        const data = await response.json()
        connectionConfig.value = {
          webUrl: data.webUrl || connectionConfig.value.webUrl,
          apiUrl: data.apiUrl || connectionConfig.value.apiUrl,
          apiKey: '', // 不暴露实际值，后端会自动使用内存中的 API Key
        }
        hasApiKeyFromEnv.value = !!data.hasApiKey
        autoStartDashboard.value = !!data.autoStartDashboard
        if (data.dashboard) {
          dashboardStatus.value = data.dashboard
        }
        initializedFromBackend.value = true
        console.log('[Hermes] Config loaded from backend, hasApiKey:', data.hasApiKey, 'autoStart:', data.autoStartDashboard)
        
        // 自动尝试连接
        if (!hermesConnected.value && !hermesConnecting.value) {
          connect().catch(() => {
            // 连接失败是正常的，会自动重试
          })
        }
      }
    } catch (error) {
      console.warn('[Hermes] Failed to load config from backend:', error)
    }
  }

  /**
   * 切换网关
   */
  async function switchGateway(gateway: 'openclaw' | 'hermes') {
    if (gateway === currentGateway.value) return
    if (gateway === 'openclaw') {
      disconnect()
    }
    currentGateway.value = gateway
    
    // 切换到 Hermes 时自动加载配置并连接
    if (gateway === 'hermes' && !initializedFromBackend.value) {
      await loadConfigFromBackend()
    }
  }

  /**
   * 更新连接配置
   */
  function updateConnectionConfig(patch: Partial<HermesConnectionConfig>) {
    connectionConfig.value = {
      ...connectionConfig.value,
      ...patch,
    }
    // 如果已连接，用新配置重新连接
    if (hermesConnected.value) {
      disconnect()
      connect()
    }
  }

  /**
   * 更新 API Key 并同步到后端 .env 文件
   */
  async function updateApiKey(apiKey: string, validate = true): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch('/api/hermes/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, validate }),
      })
      const result = await response.json()
      
      if (result.ok) {
        // 更新本地配置
        connectionConfig.value = {
          ...connectionConfig.value,
          apiKey,
        }
        // 如果已连接，用新配置重新连接
        if (hermesConnected.value) {
          disconnect()
          await connect()
        }
        return { ok: true }
      }
      
      return { ok: false, error: result.error || 'Failed to update API Key' }
    } catch (error) {
      return { 
        ok: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }

  /**
   * 更新自动启动 Dashboard 设置
   */
  async function updateAutoStartDashboard(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch('/api/hermes/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoStartDashboard: enabled }),
      })
      const result = await response.json()
      
      if (result.ok) {
        autoStartDashboard.value = enabled
        return { ok: true }
      }
      
      return { ok: false, error: result.error || 'Failed to update auto start setting' }
    } catch (error) {
      return { 
        ok: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }

  /**
   * 启动 Dashboard
   */
  async function startDashboard(): Promise<{ ok: boolean; error?: string; pid?: number; port?: number }> {
    try {
      const response = await fetch('/api/hermes/dashboard/start', {
        method: 'POST',
      })
      const result = await response.json()
      
      if (result.ok) {
        dashboardStatus.value = {
          running: true,
          pid: result.pid,
          port: result.port,
          error: null,
        }
        return { ok: true, pid: result.pid, port: result.port }
      }
      
      dashboardStatus.value.error = result.error
      return { ok: false, error: result.error }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      dashboardStatus.value.error = errorMsg
      return { ok: false, error: errorMsg }
    }
  }

  /**
   * 停止 Dashboard
   */
  async function stopDashboard(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch('/api/hermes/dashboard/stop', {
        method: 'POST',
      })
      const result = await response.json()
      
      if (result.ok) {
        dashboardStatus.value = {
          running: false,
          pid: null,
          port: null,
          error: null,
        }
        return { ok: true }
      }
      
      return { ok: false, error: result.error }
    } catch (error) {
      return { 
        ok: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }

  /**
   * 刷新 Dashboard 状态
   */
  async function refreshDashboardStatus(): Promise<void> {
    try {
      const response = await fetch('/api/hermes/dashboard')
      if (response.ok) {
        dashboardStatus.value = await response.json()
      }
    } catch (error) {
      console.warn('[Hermes] Failed to refresh dashboard status:', error)
    }
  }

  /**
   * 连接 Hermes
   */
  async function connect(): Promise<boolean> {
    if (hermesConnecting.value || hermesConnected.value) return hermesConnected.value

    hermesConnecting.value = true
    hermesError.value = null
    reconnectAttempts = 0

    try {
      client = new HermesApiClient(undefined, connectionConfig.value.apiKey)
      const status = await client.getStatus()
      hermesStatus.value = status
      hermesConnected.value = true
      currentGateway.value = 'hermes'
      console.log('[HermesConnection] Connected, version:', status.version)
      return true
    } catch (error) {
      hermesConnected.value = false
      hermesError.value = error instanceof Error ? error.message : String(error)
      // 第一次连接失败是正常的，会自动重试
      if (reconnectAttempts === 0) {
        console.debug('[HermesConnection] Initial connection attempt failed, will retry...')
      } else {
        console.warn('[HermesConnection] Connect failed:', error)
      }
      scheduleReconnect()
      return false
    } finally {
      hermesConnecting.value = false
    }
  }

  /**
   * 断开 Hermes 连接
   */
  function disconnect() {
    clearReconnectTimer()
    client = null
    hermesConnected.value = false
    hermesConnecting.value = false
    hermesError.value = null
    hermesStatus.value = null
  }

  /**
   * 测试连接（不改变当前连接状态）
   */
  async function testConnection(
    apiUrl: string,
    apiKey = '',
  ): Promise<{ ok: boolean; status?: HermesStatus; error?: string }> {
    try {
      const testClient = new HermesApiClient(undefined, apiKey)
      const status = await testClient.getStatus()
      return { ok: true, status }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 刷新状态
   */
  async function refreshStatus(): Promise<void> {
    if (!client) return
    try {
      hermesStatus.value = await client.getStatus()
    } catch (error) {
      console.error('[HermesConnection] refreshStatus failed:', error)
      // 状态刷新失败不代表断连，仅记录日志
    }
  }

  // ---- 自动重连 ----

  function scheduleReconnect() {
    clearReconnectTimer()
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[HermesConnection] Max reconnect attempts reached')
      return
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts),
      30000,
    )
    reconnectAttempts++
    console.log(
      `[HermesConnection] Reconnecting in ${delay}ms, attempt ${reconnectAttempts}`,
    )
    reconnectTimer = setTimeout(() => {
      connect()
    }, delay)
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  return {
    // 状态
    currentGateway,
    hermesConnected,
    hermesConnecting,
    hermesError,
    connectionConfig,
    hermesStatus,
    initializedFromBackend,
    hasApiKeyFromEnv,
    autoStartDashboard,
    dashboardStatus,
    // 方法
    getClient,
    getClientAsync,
    switchGateway,
    updateConnectionConfig,
    updateApiKey,
    updateAutoStartDashboard,
    loadConfigFromBackend,
    connect,
    disconnect,
    testConnection,
    refreshStatus,
    startDashboard,
    stopDashboard,
    refreshDashboardStatus,
  }
})
