import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import type { OpenClawConfig, ConfigPatch } from '@/api/types'

export const useConfigStore = defineStore('config', () => {
  const config = ref<OpenClawConfig | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  const wsStore = useWebSocketStore()

  async function fetchConfig() {
    loading.value = true
    lastError.value = null
    try {
      config.value = await wsStore.rpc.getConfig()
    } catch (error) {
      config.value = null
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[ConfigStore] fetchConfig failed:', error)
    } finally {
      loading.value = false
    }
  }

  async function patchConfig(patches: ConfigPatch[]) {
    saving.value = true
    lastError.value = null
    try {
      await wsStore.rpc.patchConfig(patches)
      await fetchConfig()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function setConfig(newConfig: OpenClawConfig) {
    saving.value = true
    lastError.value = null
    try {
      await wsStore.rpc.setConfig(newConfig)
      await fetchConfig()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function applyConfig() {
    saving.value = true
    lastError.value = null
    try {
      await wsStore.rpc.applyConfig()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  return {
    config,
    loading,
    saving,
    lastError,
    fetchConfig,
    patchConfig,
    setConfig,
    applyConfig,
  }
})
