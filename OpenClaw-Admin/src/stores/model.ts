import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import type { ModelInfo } from '@/api/types'

export const useModelStore = defineStore('model', () => {
  const models = ref<ModelInfo[]>([])
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  const wsStore = useWebSocketStore()

  async function fetchModels() {
    loading.value = true
    lastError.value = null
    try {
      models.value = await wsStore.rpc.listModels()
    } catch (error) {
      models.value = []
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[ModelStore] fetchModels failed:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    models,
    loading,
    lastError,
    fetchModels,
  }
})
