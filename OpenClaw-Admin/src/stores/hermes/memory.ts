import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useHermesConnectionStore } from './connection'

export const useHermesMemoryStore = defineStore('hermes-memory', () => {
  // ---- 状态 ----

  const memoryContent = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  // ---- 方法 ----

  /**
   * 加载记忆内容
   */
  async function fetchMemory() {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    loading.value = true
    lastError.value = null

    try {
      const result = await client.getMemory()
      memoryContent.value = result.content || ''
    } catch (error) {
      memoryContent.value = ''
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesMemoryStore] fetchMemory failed:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新记忆
   */
  async function updateMemory(content: string) {
    const connStore = useHermesConnectionStore()
    const client = await connStore.getClientAsync()
    if (!client) {
      throw new Error('Hermes 未连接')
    }

    saving.value = true
    lastError.value = null

    try {
      const result = await client.updateMemory(content)
      memoryContent.value = result.content || content
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[HermesMemoryStore] updateMemory failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  return {
    // 状态
    memoryContent,
    loading,
    saving,
    lastError,
    // 方法
    fetchMemory,
    updateMemory,
  }
})
