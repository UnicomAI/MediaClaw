import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useHermesConnectionStore } from './connection'
import type {
  HermesCronJob,
  HermesCronJobCreateParams,
  HermesCronJobUpdateParams,
} from '@/api/hermes/types'

export const useHermesCronStore = defineStore('hermes-cron', () => {
  // ---- 状态 ----

  const jobs = ref<HermesCronJob[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  // ---- 方法 ----

  /**
   * 加载任务列表
   */
  async function fetchJobs() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      jobs.value = await client.listCronJobs()
    } catch (error) {
      jobs.value = []
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesCronStore] fetchJobs failed:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 创建任务
   */
  async function createJob(params: HermesCronJobCreateParams) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      const job = await client.createCronJob(params)
      jobs.value = [...jobs.value, job]
      return job
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesCronStore] createJob failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 更新任务
   */
  async function updateJob(id: string, params: HermesCronJobUpdateParams) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      const updated = await client.updateCronJob(id, params)
      const idx = jobs.value.findIndex((j) => j.id === id)
      if (idx >= 0) {
        const list = [...jobs.value]
        list[idx] = updated
        jobs.value = list
      }
      return updated
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesCronStore] updateJob failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 删除任务
   */
  async function deleteJob(id: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      await client.deleteCronJob(id)
      jobs.value = jobs.value.filter((j) => j.id !== id)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesCronStore] deleteJob failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 暂停任务
   */
  async function pauseJob(id: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      await client.pauseCronJob(id)
      const idx = jobs.value.findIndex((j) => j.id === id)
      if (idx >= 0) {
        const list = [...jobs.value]
        list[idx] = { ...list[idx]!, enabled: false }
        jobs.value = list
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesCronStore] pauseJob failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 恢复任务
   */
  async function resumeJob(id: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      await client.resumeCronJob(id)
      const idx = jobs.value.findIndex((j) => j.id === id)
      if (idx >= 0) {
        const list = [...jobs.value]
        list[idx] = { ...list[idx]!, enabled: true }
        jobs.value = list
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesCronStore] resumeJob failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  /**
   * 手动触发任务
   */
  async function triggerJob(id: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      await client.triggerCronJob(id)
      // Re-fetch to get updated job state
      await fetchJobs()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesCronStore] triggerJob failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  return {
    // 状态
    jobs,
    loading,
    saving,
    lastError,
    // 方法
    fetchJobs,
    createJob,
    updateJob,
    deleteJob,
    pauseJob,
    resumeJob,
    triggerJob,
  }
})
