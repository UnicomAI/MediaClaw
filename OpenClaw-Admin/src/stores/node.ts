import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import type { DeviceNode, NodeInvokeParams } from '@/api/types'

export const useNodeStore = defineStore('node', () => {
  const nodes = ref<DeviceNode[]>([])
  const loading = ref(false)

  const wsStore = useWebSocketStore()

  async function fetchNodes() {
    loading.value = true
    try {
      nodes.value = await wsStore.rpc.listNodes()
    } catch (error) {
      nodes.value = []
      console.error('[NodeStore] fetchNodes failed:', error)
    } finally {
      loading.value = false
    }
  }

  async function invokeNode(params: NodeInvokeParams) {
    return await wsStore.rpc.invokeNode(params)
  }

  async function requestPairing(nodeId: string) {
    await wsStore.rpc.requestNodePairing(nodeId)
  }

  async function approvePairing(nodeId: string, code: string) {
    await wsStore.rpc.approveNodePairing(nodeId, code)
    await fetchNodes()
  }

  return {
    nodes,
    loading,
    fetchNodes,
    invokeNode,
    requestPairing,
    approvePairing,
  }
})
