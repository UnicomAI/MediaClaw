import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { OpenClawConfig, ConfigPatch, PluginEntryConfig } from '@/api/types'
import { useWebSocketStore } from './websocket'
import { maskSecretValue, normalizeSecretInput, isSecretFieldKey } from '@/utils/secret-mask'

/**
 * MediaClaw 提供商配置
 */
export interface MediaClawProviderConfig {
  apiKey?: string
  baseUrl?: string
  apiPath?: string
}

/**
 * MediaClaw 能力配置
 */
export interface MediaClawCapabilityConfig {
  provider?: 'yuanjing' | 'sglang'
  videoModel?: 'wan' | 'kling'
  yuanjing?: Partial<MediaClawProviderConfig>
  sglang?: Partial<MediaClawProviderConfig>
}

/**
 * MediaClaw 插件配置
 */
export interface MediaClawPluginConfig {
  providers?: {
    yuanjing?: MediaClawProviderConfig
    sglang?: MediaClawProviderConfig
    [key: string]: MediaClawProviderConfig | undefined
  }
  capabilities?: Record<string, MediaClawCapabilityConfig>
  defaultProvider?: 'yuanjing' | 'sglang'
  outputDir?: string
  videoPollInterval?: number
  videoMaxWaitTime?: number
}

/**
 * 插件信息
 */
export interface PluginInfo {
  id: string
  name: string
  description: string
  enabled: boolean
  hasConfig: boolean
  configType?: 'mediaclaw' | 'generic'
}

type SecretKey = string // 格式: pluginId|provider|field

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function buildSecretKey(pluginId: string, provider: string, field: string): SecretKey {
  return `${pluginId}|${provider}|${field}`
}

function parseSecretKey(key: SecretKey): { pluginId: string; provider: string; field: string } | null {
  const parts = key.split('|')
  if (parts.length !== 3) return null
  return { pluginId: parts[0], provider: parts[1], field: parts[2] }
}

export const usePluginsStore = defineStore('plugins', () => {
  const wsStore = useWebSocketStore()

  // 状态
  const config = ref<OpenClawConfig | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const applying = ref(false)
  const lastError = ref<string | null>(null)
  const secretUpdates = ref<Record<SecretKey, string>>({})
  const drafts = ref<Record<string, Record<string, unknown>>>({})
  const enabledDrafts = ref<Record<string, boolean>>({})

  // 已知的插件配置类型
  const KNOWN_PLUGINS: Record<string, { name: string; description: string; configType: 'mediaclaw' | 'generic' }> = {
    mediaclaw: {
      name: 'MediaClaw',
      description: '元景多模态团队提供的媒体生成能力：文生图、文生视频、语音合成、数字人等。',
      configType: 'mediaclaw',
    },
    ollama: {
      name: 'Ollama',
      description: '本地模型推理服务集成',
      configType: 'generic',
    },
    vllm: {
      name: 'vLLM',
      description: '高性能 LLM 推理服务集成',
      configType: 'generic',
    },
  }

  // 插件列表
  const plugins = computed<PluginInfo[]>(() => {
    const entries = config.value?.plugins?.entries || {}
    const result: PluginInfo[] = []

    for (const [id, info] of Object.entries(KNOWN_PLUGINS)) {
      const entry = entries[id] as PluginEntryConfig | undefined
      result.push({
        id,
        name: info.name,
        description: info.description,
        enabled: entry?.enabled ?? false,
        hasConfig: !!(entry?.config && Object.keys(entry.config).length > 0),
        configType: info.configType,
      })
    }

    // 添加未知插件
    for (const [id, entry] of Object.entries(entries)) {
      if (!KNOWN_PLUGINS[id]) {
        const entryConfig = entry as PluginEntryConfig | undefined
        result.push({
          id,
          name: id,
          description: '自定义插件',
          enabled: entryConfig?.enabled ?? false,
          hasConfig: !!(entryConfig?.config && Object.keys(entryConfig.config).length > 0),
          configType: 'generic',
        })
      }
    }

    return result
  })

  /**
   * 获取插件配置
   */
  function getPluginConfig(pluginId: string): Record<string, unknown> {
    // 优先返回 draft
    if (drafts.value[pluginId]) {
      return drafts.value[pluginId]
    }
    // 否则返回原始配置
    const entries = config.value?.plugins?.entries || {}
    const entry = entries[pluginId] as PluginEntryConfig | undefined
    return asRecord(entry?.config || {})
  }

  /**
   * 获取 MediaClaw 插件配置（类型化）
   */
  function getMediaClawConfig(pluginId: string): MediaClawPluginConfig {
    const raw = getPluginConfig(pluginId)
    return raw as MediaClawPluginConfig
  }

  /**
   * 获取插件启用状态
   */
  function getPluginEnabled(pluginId: string): boolean {
    if (pluginId in enabledDrafts.value) {
      return enabledDrafts.value[pluginId]
    }
    const entries = config.value?.plugins?.entries || {}
    const entry = entries[pluginId] as PluginEntryConfig | undefined
    return entry?.enabled ?? false
  }

  /**
   * 设置插件启用状态
   */
  function setPluginEnabled(pluginId: string, enabled: boolean): void {
    enabledDrafts.value[pluginId] = enabled
  }

  /**
   * 设置插件配置字段
   */
  function setPluginField(pluginId: string, path: string, value: unknown): void {
    if (!drafts.value[pluginId]) {
      const entries = config.value?.plugins?.entries || {}
      const entry = entries[pluginId] as PluginEntryConfig | undefined
      drafts.value[pluginId] = deepClone(asRecord(entry?.config || {}))
    }

    const paths = path.split('.')
    let current = drafts.value[pluginId]

    for (let i = 0; i < paths.length - 1; i++) {
      const key = paths[i]
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key] as Record<string, unknown>
    }

    const lastKey = paths[paths.length - 1]
    if (value === undefined || value === null || value === '') {
      delete current[lastKey]
    } else {
      current[lastKey] = value
    }
  }

  /**
   * 获取敏感字段的掩码值
   */
  function getMaskedSecret(pluginId: string, provider: string, field: string): string {
    const pluginConfig = getPluginConfig(pluginId)
    const providers = asRecord(pluginConfig.providers)
    const providerConfig = asRecord(providers[provider])
    const value = providerConfig[field]
    return maskSecretValue(value)
  }

  /**
   * 获取敏感字段的待更新值
   */
  function getSecretUpdate(pluginId: string, provider: string, field: string): string {
    const key = buildSecretKey(pluginId, provider, field)
    return secretUpdates.value[key] || ''
  }

  /**
   * 设置敏感字段的待更新值
   */
  function setSecretUpdate(pluginId: string, provider: string, field: string, value: string): void {
    const key = buildSecretKey(pluginId, provider, field)
    const normalized = normalizeSecretInput(value)
    if (normalized) {
      secretUpdates.value[key] = normalized
    } else {
      delete secretUpdates.value[key]
    }
  }

  /**
   * 检查是否有待更新的敏感字段
   */
  function hasSecretUpdate(pluginId: string, provider: string, field: string): boolean {
    const key = buildSecretKey(pluginId, provider, field)
    return key in secretUpdates.value
  }

  /**
   * 构建持久化配置（合并敏感更新）
   */
  function buildPersistedConfig(pluginId: string): Record<string, unknown> {
    const draft = deepClone(getPluginConfig(pluginId))

    // 合并敏感字段更新
    for (const [key, value] of Object.entries(secretUpdates.value)) {
      const parsed = parseSecretKey(key)
      if (!parsed || parsed.pluginId !== pluginId) continue

      if (!draft.providers) draft.providers = {}
      const providers = draft.providers as Record<string, MediaClawProviderConfig>
      if (!providers[parsed.provider]) providers[parsed.provider] = {}
      providers[parsed.provider][parsed.field as keyof MediaClawProviderConfig] = value
    }

    return draft
  }

  /**
   * 检查是否有未保存的更改
   */
  function hasChanges(pluginId: string): boolean {
    // 检查启用状态变更
    const originalEnabled = getPluginEnabled(pluginId)
    const entries = config.value?.plugins?.entries || {}
    const entry = entries[pluginId] as PluginEntryConfig | undefined
    const savedEnabled = entry?.enabled ?? false
    if (originalEnabled !== savedEnabled) return true

    // 检查配置变更
    const draft = drafts.value[pluginId]
    if (draft) {
      const originalConfig = asRecord(entry?.config || {})
      if (!deepEqual(draft, originalConfig)) return true
    }

    // 检查敏感字段更新
    for (const key of Object.keys(secretUpdates.value)) {
      const parsed = parseSecretKey(key)
      if (parsed && parsed.pluginId === pluginId) return true
    }

    return false
  }

  /**
   * 刷新配置
   */
  async function refresh(): Promise<void> {
    loading.value = true
    lastError.value = null
    try {
      const cfg = await wsStore.rpc.getConfig()
      config.value = cfg
      // 清空 drafts，重新从配置加载
      drafts.value = {}
      enabledDrafts.value = {}
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存插件配置
   */
  async function savePlugin(pluginId: string, apply: boolean = false): Promise<boolean> {
    saving.value = true
    lastError.value = null
    try {
      const patches: ConfigPatch[] = []
      const persistedConfig = buildPersistedConfig(pluginId)
      const enabled = getPluginEnabled(pluginId)

      // 确保 plugins.entries 结构存在
      const entries = config.value?.plugins?.entries || {}
      const entry = entries[pluginId] as PluginEntryConfig | undefined
      const originalConfig = asRecord(entry?.config || {})
      const originalEnabled = entry?.enabled ?? false

      // 检查启用状态变更
      if (enabled !== originalEnabled) {
        patches.push({
          path: `plugins.entries.${pluginId}.enabled`,
          value: enabled,
        })
      }

      // 检查配置变更
      if (!deepEqual(persistedConfig, originalConfig)) {
        patches.push({
          path: `plugins.entries.${pluginId}.config`,
          value: persistedConfig,
        })
      }

      if (patches.length === 0) {
        return false
      }

      await wsStore.rpc.patchConfig(patches)

      // 刷新配置
      const cfg = await wsStore.rpc.getConfig()
      config.value = cfg

      // 清空该插件的 drafts 和敏感更新
      delete drafts.value[pluginId]
      delete enabledDrafts.value[pluginId]
      for (const key of Object.keys(secretUpdates.value)) {
        const parsed = parseSecretKey(key)
        if (parsed && parsed.pluginId === pluginId) {
          delete secretUpdates.value[key]
        }
      }

      // 如果需要应用
      if (apply) {
        applying.value = true
        try {
          await wsStore.rpc.applyConfig()
        } finally {
          applying.value = false
        }
      }

      return true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 重置插件配置到原始状态
   */
  function resetPlugin(pluginId: string): void {
    delete drafts.value[pluginId]
    delete enabledDrafts.value[pluginId]
    for (const key of Object.keys(secretUpdates.value)) {
      const parsed = parseSecretKey(key)
      if (parsed && parsed.pluginId === pluginId) {
        delete secretUpdates.value[key]
      }
    }
  }

  return {
    // 状态
    config,
    loading,
    saving,
    applying,
    lastError,
    secretUpdates,
    drafts,
    enabledDrafts,

    // 计算属性
    plugins,

    // 方法
    getPluginConfig,
    getMediaClawConfig,
    getPluginEnabled,
    setPluginEnabled,
    setPluginField,
    getMaskedSecret,
    getSecretUpdate,
    setSecretUpdate,
    hasSecretUpdate,
    buildPersistedConfig,
    hasChanges,
    refresh,
    savePlugin,
    resetPlugin,
  }
})
