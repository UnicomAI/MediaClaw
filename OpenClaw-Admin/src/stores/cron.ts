import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import type { CronJob, CronRunLogEntry, CronStatus, CronUpsertParams } from '@/api/types'

export const useCronStore = defineStore('cron', () => {
  const jobs = ref<CronJob[]>([])
  const status = ref<CronStatus | null>(null)
  const selectedJobId = ref<string | null>(null)
  const runs = ref<CronRunLogEntry[]>([])
  const loading = ref(false)
  const statusLoading = ref(false)
  const runsLoading = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  const wsStore = useWebSocketStore()

  async function fetchJobs() {
    loading.value = true
    lastError.value = null
    try {
      jobs.value = await wsStore.rpc.listCrons()
    } catch (error) {
      jobs.value = []
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[CronStore] fetchJobs failed:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchStatus() {
    statusLoading.value = true
    lastError.value = null
    try {
      status.value = await wsStore.rpc.getCronStatus()
    } catch (error) {
      status.value = null
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[CronStore] fetchStatus failed:', error)
    } finally {
      statusLoading.value = false
    }
  }

  async function fetchOverview() {
    await Promise.all([fetchJobs(), fetchStatus()])
  }

  async function fetchRuns(jobId: string, limit = 50) {
    selectedJobId.value = jobId
    runsLoading.value = true
    lastError.value = null
    try {
      runs.value = await wsStore.rpc.listCronRuns(jobId, limit)
    } catch (error) {
      runs.value = []
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[CronStore] fetchRuns failed:', error)
    } finally {
      runsLoading.value = false
    }
  }

  function clearRuns() {
    selectedJobId.value = null
    runs.value = []
  }

  async function createJob(params: CronUpsertParams) {
    saving.value = true
    lastError.value = null
    try {
      await wsStore.rpc.createCron(params)
      await fetchOverview()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function updateJob(id: string, params: Partial<CronUpsertParams>) {
    saving.value = true
    lastError.value = null
    try {
      await wsStore.rpc.updateCron(id, params)
      await fetchOverview()
      if (selectedJobId.value === id) {
        await fetchRuns(id)
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function deleteJob(id: string) {
    saving.value = true
    lastError.value = null
    try {
      await wsStore.rpc.deleteCron(id)
      if (selectedJobId.value === id) {
        clearRuns()
      }
      await fetchOverview()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function runJob(id: string, mode: 'force' | 'due' = 'force') {
    saving.value = true
    lastError.value = null
    try {
      await wsStore.rpc.runCron(id, mode)
      await fetchOverview()
      await fetchRuns(id)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  return {
    jobs,
    status,
    selectedJobId,
    runs,
    loading,
    statusLoading,
    runsLoading,
    saving,
    lastError,
    fetchJobs,
    fetchStatus,
    fetchOverview,
    fetchRuns,
    clearRuns,
    createJob,
    updateJob,
    deleteJob,
    runJob,
  }
})
