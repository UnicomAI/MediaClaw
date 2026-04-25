import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useHermesConnectionStore } from './connection'
import { useHermesConfigStore } from './config'
import type { HermesPlatform } from '@/api/hermes/types'

/**
 * 从 Hermes 配置中提取平台列表
 */
function extractPlatformsFromConfig(config: Record<string, unknown>): HermesPlatform[] {
  const platformsConfig = config.platforms
  if (!platformsConfig || typeof platformsConfig !== 'object' || Array.isArray(platformsConfig)) {
    return []
  }

  const result: HermesPlatform[] = []
  const entries = Object.entries(platformsConfig as Record<string, unknown>)

  for (const [id, platformConf] of entries) {
    if (!platformConf || typeof platformConf !== 'object') continue

    const conf = platformConf as Record<string, unknown>
    result.push({
      id,
      name: (conf.name as string) || id,
      type: (conf.type as string) || id,
      enabled: conf.enabled !== false,
      configured: !!conf.configured || !!conf.token || !!conf.apiKey,
      config: conf as Record<string, unknown>,
    })
  }

  return result
}

export const useHermesChannelStore = defineStore('hermes-channel', () => {
  // ---- 状态 ----

  const platforms = ref<HermesPlatform[]>([])
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  // ---- 方法 ----

  /**
   * 从配置中提取平台列表
   */
  async function fetchPlatforms() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      // 优先通过平台 API 获取
      platforms.value = await client.listPlatforms()
    } catch (apiError) {
      console.warn(
        '[HermesChannelStore] listPlatforms API not available, falling back to config extraction:',
        apiError,
      )
      // 回退：从配置中提取
      try {
        const configStore = useHermesConfigStore()
        if (!configStore.config) {
          await configStore.fetchConfig()
        }
        if (configStore.config) {
          platforms.value = extractPlatformsFromConfig(configStore.config)
        } else {
          platforms.value = []
        }
      } catch (configError) {
        platforms.value = []
        lastError.value =
          configError instanceof Error ? configError.message : String(configError)
        console.error('[HermesChannelStore] fetchPlatforms failed:', configError)
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新平台配置
   */
  async function updatePlatform(
    platformId: string,
    platformConfig: Record<string, unknown>,
  ) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      const updated = await client.updatePlatform(platformId, platformConfig)
      const idx = platforms.value.findIndex((p) => p.id === platformId)
      if (idx >= 0) {
        const list = [...platforms.value]
        list[idx] = updated
        platforms.value = list
      } else {
        platforms.value = [...platforms.value, updated]
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesChannelStore] updatePlatform failed:', error)
      throw error
    }
  }

  /**
   * 创建平台
   */
  async function createPlatform(
    platformId: string,
    platformConfig: Record<string, unknown>,
  ) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      const created = await client.createPlatform(platformId, platformConfig)
      platforms.value = [...platforms.value, created]
      return created
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesChannelStore] createPlatform failed:', error)
      throw error
    }
  }

  /**
   * 删除平台
   */
  async function deletePlatform(platformId: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    lastError.value = null

    try {
      await client.deletePlatform(platformId)
      platforms.value = platforms.value.filter((p) => p.id !== platformId)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesChannelStore] deletePlatform failed:', error)
      throw error
    }
  }

  return {
    // 状态
    platforms,
    loading,
    lastError,
    // 方法
    fetchPlatforms,
    updatePlatform,
    createPlatform,
    deletePlatform,
  }
})
