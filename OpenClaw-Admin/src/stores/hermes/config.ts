import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useHermesConnectionStore } from './connection'
import type { HermesConfig, HermesConfigUpdateParams, HermesConfigSchema } from '@/api/hermes/types'

export const useHermesConfigStore = defineStore('hermes-config', () => {
  // ---- 状态 ----

  const config = ref<HermesConfig | null>(null)
  const rawConfig = ref('')
  const configSchema = ref<HermesConfigSchema | null>(null)
  const defaults = ref<HermesConfig | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)
  const modifiedFields = ref<Set<string>>(new Set())

  // ---- 方法 ----

  /**
   * 加载配置
   */
  async function fetchConfig() {
    const connStore = useHermesConnectionStore()
    
    loading.value = true
    lastError.value = null

    try {
      const client = await connStore.getClientAsync()
      if (!client) {
        throw new Error('Hermes 客户端未初始化')
      }
      const result = await client.getConfig()
      console.log('[HermesConfigStore] fetchConfig success:', result ? 'got config' : 'null result')
      config.value = result
    } catch (error) {
      config.value = null
      lastError.value = error instanceof Error ? error.message : String(error)
      // 连接失败是正常的重试行为，不打印警告
      if (error instanceof Error && error.message.includes('连接失败')) {
        console.debug('[HermesConfigStore] fetchConfig: waiting for connection...')
      } else {
        console.warn('[HermesConfigStore] fetchConfig failed:', error)
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新配置（部分更新）
   */
  async function updateConfig(params: HermesConfigUpdateParams) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      await client.updateConfig(params)
      // Re-fetch to get updated config
      await fetchConfig()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] updateConfig failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 加载原始 YAML 配置
   */
  async function fetchRawConfig() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      rawConfig.value = await client.getRawConfig()
    } catch (error) {
      rawConfig.value = ''
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] fetchRawConfig failed:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新原始 YAML 配置
   */
  async function updateRawConfig(yaml: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      await client.updateRawConfig(yaml)
      rawConfig.value = yaml
      // 更新后重新加载结构化配置
      await fetchConfig()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] updateRawConfig failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 加载配置默认值
   */
  async function fetchDefaults() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      defaults.value = await client.getConfigDefaults()
    } catch (error) {
      defaults.value = null
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] fetchDefaults failed:', error)
    }
  }

  /**
   * 加载配置 Schema
   */
  async function fetchConfigSchema() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      configSchema.value = await client.getConfigSchema()
    } catch (error) {
      configSchema.value = null
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesConfigStore] fetchConfigSchema failed:', error)
    }
  }

  /**
   * 加载全部配置数据（配置 + 默认值 + Schema）
   */
  async function fetchAll() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      const [configResult, defaultsResult, schemaResult] = await Promise.allSettled([
        client.getConfig(),
        client.getConfigDefaults(),
        client.getConfigSchema(),
      ])

      if (configResult.status === 'fulfilled') {
        config.value = configResult.value
      } else {
        lastError.value = configResult.reason instanceof Error
          ? configResult.reason.message
          : String(configResult.reason)
      }

      if (defaultsResult.status === 'fulfilled') {
        defaults.value = defaultsResult.value
      }

      if (schemaResult.status === 'fulfilled') {
        configSchema.value = schemaResult.value
      }
    } finally {
      loading.value = false
    }
  }

  // ---- 修改追踪 ----

  /**
   * 重置所有修改状态
   */
  function resetModified() {
    modifiedFields.value = new Set()
  }

  /**
   * 检查字段是否已修改
   */
  function isFieldModified(key: string): boolean {
    return modifiedFields.value.has(key)
  }

  /**
   * 标记字段为已修改
   */
  function markFieldModified(key: string) {
    const newSet = new Set(modifiedFields.value)
    newSet.add(key)
    modifiedFields.value = newSet
  }

  /**
   * 取消字段修改标记
   */
  function unmarkFieldModified(key: string) {
    const newSet = new Set(modifiedFields.value)
    newSet.delete(key)
    modifiedFields.value = newSet
  }

  /**
   * 是否有任何修改
   */
  const hasModifications = computed(() => modifiedFields.value.size > 0)

  /**
   * 获取已修改字段列表
   */
  const modifiedFieldsList = computed(() => Array.from(modifiedFields.value))

  return {
    // 状态
    config,
    rawConfig,
    configSchema,
    defaults,
    loading,
    saving,
    lastError,
    modifiedFields,
    hasModifications,
    modifiedFieldsList,
    // 方法
    fetchConfig,
    updateConfig,
    fetchRawConfig,
    updateRawConfig,
    fetchDefaults,
    fetchConfigSchema,
    fetchAll,
    resetModified,
    isFieldModified,
    markFieldModified,
    unmarkFieldModified,
  }
})
