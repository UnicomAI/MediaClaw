import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useHermesConnectionStore } from './connection'
import { useHermesConfigStore } from './config'
import type { HermesModel, HermesEnvVar, ModelEndpoint, ModelSelection } from '@/api/hermes/types'
import { HERMES_PROVIDERS } from '@/api/hermes/types'

export const useHermesModelStore = defineStore('hermes-model', () => {
  // ---- 状态 ----

  const models = ref<HermesModel[]>([])
  const currentModel = ref('')
  const currentModelSelection = ref<ModelSelection | null>(null)
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  const envVars = ref<HermesEnvVar[]>([])
  const rawEnvVars = ref<Record<string, unknown>>({})
  const envLoading = ref(false)

  // ---- 计算属性 ----

  const modelEndpoints = computed<ModelEndpoint[]>(() => {
    const configStore = useHermesConfigStore()
    const config = configStore.config
    const endpoints: ModelEndpoint[] = []
    const defaultModel = typeof config?.model === 'string' ? config.model : config?.model?.default || ''

    // 添加已配置的 Provider
    for (const provider of HERMES_PROVIDERS) {
      const envVar = envVars.value.find(v => v.key === provider.envKey)
      const rawVar = rawEnvVars.value[provider.envKey] as { is_set?: boolean } | undefined
      const isConfigured = !!(envVar?.value || rawVar?.is_set)

      if (isConfigured) {
        const baseUrl = rawEnvVars.value[provider.baseUrlKey!] as { value?: string } | undefined
        const providerModels: { id: string; name?: string; isDefault?: boolean }[] = []

        // 从 models 列表中筛选属于该 provider 的模型
        for (const m of models.value) {
          if (m.provider === provider.id || m.provider === provider.name) {
            providerModels.push({
              id: m.id,
              name: m.label || m.id,
              isDefault: m.id === defaultModel,
            })
          }
        }

        if (providerModels.length > 0 || provider.supportsModelList) {
          endpoints.push({
            id: provider.id,
            name: provider.name,
            baseUrl: (baseUrl?.value as string) || provider.defaultBaseUrl,
            type: 'configured',
            models: providerModels,
          })
        }
      }
    }

    // 添加自定义端点
    const customProviders = config?.custom_providers
    if (customProviders) {
      const cpArray = Array.isArray(customProviders) ? customProviders : [customProviders]
      for (const cp of cpArray) {
        if (cp && cp.name && cp.base_url) {
          const providerModels: { id: string; name?: string; isDefault?: boolean }[] = []

          // 从 models 列表中筛选属于该端点的模型
          if (cp.models && typeof cp.models === 'object') {
            for (const modelId of Object.keys(cp.models)) {
              providerModels.push({
                id: modelId,
                name: modelId,
                isDefault: modelId === defaultModel,
              })
            }
          }

          endpoints.push({
            id: cp.name,
            name: cp.name,
            baseUrl: cp.base_url,
            type: 'custom',
            models: providerModels,
          })
        }
      }
    }

    return endpoints
  })

  const allSelectableModels = computed(() => {
    const configStore = useHermesConfigStore()
    const config = configStore.config
    const result: { modelId: string; providerName: string; baseUrl?: string; type: 'configured' | 'custom'; label: string }[] = []
    const addedModelIds = new Set<string>()

    const defaultModel = typeof config?.model === 'string' ? config.model : config?.model?.default || ''
    const defaultProvider = typeof config?.model === 'object' ? config.model.provider : config?.provider

    if (defaultModel && !addedModelIds.has(defaultModel)) {
      addedModelIds.add(defaultModel)
      result.push({
        modelId: defaultModel,
        providerName: defaultProvider || 'default',
        type: 'configured',
        label: `${defaultModel} (${defaultProvider || 'default'})`,
      })
    }

    const customProviders = config?.custom_providers
    if (customProviders) {
      const cpArray = Array.isArray(customProviders) ? customProviders : [customProviders]
      for (const cp of cpArray) {
        if (cp && cp.name && cp.base_url) {
          if (cp.models && typeof cp.models === 'object') {
            for (const modelId of Object.keys(cp.models)) {
              if (!addedModelIds.has(modelId)) {
                addedModelIds.add(modelId)
                result.push({
                  modelId,
                  providerName: cp.name,
                  baseUrl: cp.base_url,
                  type: 'custom',
                  label: `${modelId} (${cp.name})`,
                })
              }
            }
          }

          if (cp.model && !addedModelIds.has(cp.model)) {
            addedModelIds.add(cp.model)
            result.push({
              modelId: cp.model,
              providerName: cp.name,
              baseUrl: cp.base_url,
              type: 'custom',
              label: `${cp.model} (${cp.name})`,
            })
          }
        }
      }
    }

    return result
  })

  // ---- 方法 ----

  /**
   * 加载模型列表
   */
  async function fetchModels() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      models.value = await client.listModels()
    } catch (error) {
      models.value = []
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesModelStore] fetchModels failed:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 设置当前模型（通过配置 API）
   */
  async function setCurrentModel(modelId: string, options?: { provider?: string; baseUrl?: string }) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      await client.setCurrentModel(modelId, options)
      currentModel.value = modelId
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesModelStore] setCurrentModel failed:', error)
      throw error
    }
  }

  /**
   * 设置当前模型选择（包含端点信息）
   */
  function setCurrentModelSelection(selection: ModelSelection | null) {
    currentModelSelection.value = selection
    if (selection) {
      currentModel.value = selection.modelId
    }
  }

  /**
   * 从配置中同步当前模型
   */
  function syncCurrentModelFromConfig(configModel?: string) {
    if (configModel) {
      currentModel.value = configModel
    }
  }

  /**
   * 从配置中同步当前模型选择（包含端点信息）
   */
  function syncCurrentModelSelectionFromConfig() {
    const configStore = useHermesConfigStore()
    const config = configStore.config
    if (!config) return

    const defaultModel = typeof config.model === 'string' ? config.model : config.model?.default || ''
    if (!defaultModel) return

    currentModel.value = defaultModel

    // 尝试从配置中找到对应的端点信息
    const provider = config.provider || config.modelProvider
    if (provider) {
      const baseUrl = typeof config.model === 'object' ? config.model.base_url : undefined
      const isCustom = !HERMES_PROVIDERS.some(p => p.id === provider)

      currentModelSelection.value = {
        modelId: defaultModel,
        providerName: provider,
        baseUrl,
        type: isCustom ? 'custom' : 'configured',
      }
    } else {
      // 尝试从 custom_providers 中查找
      const customProviders = config.custom_providers
      if (customProviders) {
        const cpArray = Array.isArray(customProviders) ? customProviders : [customProviders]
        for (const cp of cpArray) {
          if (cp && cp.models && typeof cp.models === 'object' && defaultModel in cp.models) {
            currentModelSelection.value = {
              modelId: defaultModel,
              providerName: cp.name,
              baseUrl: cp.base_url,
              type: 'custom',
            }
            break
          }
        }
      }
    }
  }

  // ---- 环境变量方法 ----

  /**
   * 获取环境变量列表
   */
  async function fetchEnvVars() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    envLoading.value = true
    lastError.value = null

    try {
      const result = await client.listEnvVarsRaw()
      rawEnvVars.value = result.raw
      envVars.value = result.vars
    } catch (error) {
      envVars.value = []
      rawEnvVars.value = {}
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesModelStore] fetchEnvVars failed:', error)
    } finally {
      envLoading.value = false
    }
  }

  /**
   * 设置环境变量
   */
  async function setEnvVar(key: string, value: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      await client.setEnvVar(key, value)
      await fetchEnvVars()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesModelStore] setEnvVar failed:', error)
      throw error
    }
  }

  /**
   * 删除环境变量
   */
  async function deleteEnvVar(key: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      await client.deleteEnvVar(key)
      await fetchEnvVars()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesModelStore] deleteEnvVar failed:', error)
      throw error
    }
  }

  /**
   * 显示环境变量明文
   */
  async function revealEnvVar(key: string): Promise<string> {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      return await client.revealEnvVar(key)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesModelStore] revealEnvVar failed:', error)
      throw error
    }
  }

  return {
    // 状态
    models,
    currentModel,
    currentModelSelection,
    loading,
    lastError,
    envVars,
    rawEnvVars,
    envLoading,
    // 计算属性
    modelEndpoints,
    allSelectableModels,
    // 方法
    fetchModels,
    setCurrentModel,
    setCurrentModelSelection,
    syncCurrentModelFromConfig,
    syncCurrentModelSelectionFromConfig,
    fetchEnvVars,
    setEnvVar,
    deleteEnvVar,
    revealEnvVar,
  }
})
