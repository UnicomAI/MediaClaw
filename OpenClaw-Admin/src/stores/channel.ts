import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import type { Channel, ChannelAuthParams, PairParams } from '@/api/types'

export const useChannelStore = defineStore('channel', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)

  const wsStore = useWebSocketStore()

  async function fetchChannels() {
    loading.value = true
    try {
      channels.value = await wsStore.rpc.listChannels()
    } catch (error) {
      channels.value = []
      console.error('[ChannelStore] fetchChannels failed:', error)
    } finally {
      loading.value = false
    }
  }

  async function authChannel(params: ChannelAuthParams) {
    return await wsStore.rpc.authChannel(params)
  }

  async function pairChannel(params: PairParams) {
    await wsStore.rpc.pairChannel(params)
    await fetchChannels()
  }

  return {
    channels,
    loading,
    fetchChannels,
    authChannel,
    pairChannel,
  }
})
