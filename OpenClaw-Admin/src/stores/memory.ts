import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import type { AgentFileEntry, AgentInfo, OpenClawConfig } from '@/api/types'
import { byLocale, getActiveLocale } from '@/i18n/text'

const BOOTSTRAP_FILE_ORDER = [
  'AGENTS.md',
  'SOUL.md',
  'IDENTITY.md',
  'USER.md',
  'TOOLS.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
]

const MEMORY_FILE_ORDER = [
  'MEMORY.md',
  'memory.md',
]

const KNOWN_FILE_ORDER = [...BOOTSTRAP_FILE_ORDER, ...MEMORY_FILE_ORDER]

function sortKnownFiles(files: AgentFileEntry[]): AgentFileEntry[] {
  const rank = new Map<string, number>(KNOWN_FILE_ORDER.map((name, index) => [name, index]))
  return [...files].sort((a, b) => {
    const ra = rank.has(a.name) ? (rank.get(a.name) as number) : 999
    const rb = rank.has(b.name) ? (rank.get(b.name) as number) : 999
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })
}

function collapseMemoryAlias(files: AgentFileEntry[]): AgentFileEntry[] {
  const memoryUpper = files.find((item) => item.name === 'MEMORY.md')
  const memoryLower = files.find((item) => item.name === 'memory.md')

  if (!memoryUpper || !memoryLower) return files

  const pickPreferred = () => {
    if (!memoryUpper.missing && memoryLower.missing) return memoryUpper
    if (!memoryLower.missing && memoryUpper.missing) return memoryLower

    const upperUpdated = memoryUpper.updatedAtMs || 0
    const lowerUpdated = memoryLower.updatedAtMs || 0
    if (upperUpdated !== lowerUpdated) {
      return upperUpdated > lowerUpdated ? memoryUpper : memoryLower
    }

    const upperSize = memoryUpper.size || 0
    const lowerSize = memoryLower.size || 0
    if (upperSize !== lowerSize) {
      return upperSize > lowerSize ? memoryUpper : memoryLower
    }

    return memoryUpper
  }

  const winnerName = pickPreferred().name
  return files.filter((item) => {
    if (item.name !== 'MEMORY.md' && item.name !== 'memory.md') return true
    return item.name === winnerName
  })
}

function pickPreferredFile(files: AgentFileEntry[], fallback = 'MEMORY.md'): string {
  const names = files.map((item) => item.name)
  if (names.includes('MEMORY.md')) return 'MEMORY.md'
  if (names.includes('memory.md')) return 'memory.md'
  if (names.includes('AGENTS.md')) return 'AGENTS.md'
  const first = names[0]
  if (first) return first
  return fallback
}

function hasMemoryFile(files: AgentFileEntry[]): boolean {
  return files.some((item) => MEMORY_FILE_ORDER.includes(item.name))
}

function normalizeAgentsFromConfig(config: OpenClawConfig): AgentInfo[] {
  const ids = new Set<string>()
  ids.add('main')

  const list = Array.isArray(config.agents?.list) ? config.agents?.list : []
  for (const item of list) {
    const id = typeof item?.id === 'string' ? item.id.trim() : ''
    if (id) ids.add(id)
  }

  return Array.from(ids)
    .sort((a, b) => {
      if (a === 'main') return -1
      if (b === 'main') return 1
      return a.localeCompare(b)
    })
    .map((id) => ({ id }))
}

export const useMemoryStore = defineStore('memory', () => {
  const wsStore = useWebSocketStore()

  const agents = ref<AgentInfo[]>([])
  const defaultAgentId = ref('main')
  const selectedAgentId = ref('')
  const workspace = ref('')
  const files = ref<AgentFileEntry[]>([])
  const selectedFileName = ref('MEMORY.md')
  const currentContent = ref('')

  const loadingAgents = ref(false)
  const loadingFiles = ref(false)
  const loadingFileContent = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  const docFiles = computed(() => sortKnownFiles(collapseMemoryAlias(files.value)))
  const activeFile = computed(() => docFiles.value.find((item) => item.name === selectedFileName.value) || null)

  function upsertFile(file: AgentFileEntry) {
    const index = files.value.findIndex((item) => item.name === file.name)
    if (index >= 0) {
      files.value.splice(index, 1, file)
      return
    }
    files.value.push(file)
  }

  function ensureKnownPlaceholders() {
    const existing = new Set(files.value.map((item) => item.name))
    for (const name of BOOTSTRAP_FILE_ORDER) {
      if (existing.has(name)) continue
      files.value.push({
        name,
        path: workspace.value ? `${workspace.value}/${name}` : name,
        missing: true,
      })
    }

    if (hasMemoryFile(files.value)) return
    files.value.push({
      name: 'MEMORY.md',
      path: workspace.value ? `${workspace.value}/MEMORY.md` : 'MEMORY.md',
      missing: true,
    })
  }

  function ensureSelectedFileName() {
    if (selectedFileName.value && docFiles.value.some((item) => item.name === selectedFileName.value)) return
    const preferred = pickPreferredFile(docFiles.value, selectedFileName.value || 'MEMORY.md')
    selectedFileName.value = preferred
  }

  async function fetchAgents() {
    loadingAgents.value = true
    lastError.value = null
    try {
      const result = await wsStore.rpc.listAgents()
      if (result.agents.length > 0) {
        agents.value = result.agents
        defaultAgentId.value = result.defaultId || result.mainKey || result.agents[0]?.id || 'main'
      } else {
        throw new Error(byLocale('未读取到 agent 列表', 'No agents returned', getActiveLocale()))
      }
    } catch (error) {
      try {
        const config = await wsStore.rpc.getConfig()
        const fallbackAgents = normalizeAgentsFromConfig(config)
        agents.value = fallbackAgents
        defaultAgentId.value = fallbackAgents[0]?.id || 'main'
      } catch {
        agents.value = [{ id: 'main' }]
        defaultAgentId.value = 'main'
      }
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[MemoryStore] fetchAgents failed, fallback to config:', error)
    } finally {
      loadingAgents.value = false
    }

    if (!selectedAgentId.value || !agents.value.some((item) => item.id === selectedAgentId.value)) {
      selectedAgentId.value = defaultAgentId.value || agents.value[0]?.id || 'main'
    }
  }

  async function fetchFiles(agentId = selectedAgentId.value) {
    if (!agentId) return
    loadingFiles.value = true
    lastError.value = null
    try {
      const result = await wsStore.rpc.listAgentFiles(agentId)
      workspace.value = result.workspace || ''
      files.value = sortKnownFiles(result.files)
      ensureKnownPlaceholders()
      ensureSelectedFileName()
    } catch (error) {
      files.value = []
      workspace.value = ''
      ensureKnownPlaceholders()
      ensureSelectedFileName()
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[MemoryStore] fetchFiles failed:', error)
    } finally {
      loadingFiles.value = false
    }
  }

  async function loadFile(name = selectedFileName.value) {
    if (!selectedAgentId.value || !name) return
    selectedFileName.value = name
    loadingFileContent.value = true
    lastError.value = null
    try {
      const result = await wsStore.rpc.getAgentFile(selectedAgentId.value, name)
      workspace.value = result.workspace || workspace.value
      upsertFile(result.file)
      files.value = sortKnownFiles(files.value)
      currentContent.value = result.file.content || ''
    } catch (error) {
      currentContent.value = ''
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[MemoryStore] loadFile failed:', error)
      throw error
    } finally {
      loadingFileContent.value = false
    }
  }

  async function saveFile(content: string, name = selectedFileName.value) {
    if (!selectedAgentId.value || !name) return
    saving.value = true
    lastError.value = null
    try {
      const result = await wsStore.rpc.setAgentFile(selectedAgentId.value, name, content)
      workspace.value = result.workspace || workspace.value
      upsertFile(result.file)
      files.value = sortKnownFiles(files.value)
      currentContent.value = content
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      console.error('[MemoryStore] saveFile failed:', error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function switchAgent(agentId: string) {
    if (!agentId) return
    selectedAgentId.value = agentId
    await fetchFiles(agentId)
    await loadFile(selectedFileName.value)
  }

  async function refresh() {
    await fetchFiles(selectedAgentId.value)
    await loadFile(selectedFileName.value)
  }

  async function initialize() {
    await fetchAgents()
    await fetchFiles(selectedAgentId.value)
    await loadFile(selectedFileName.value)
  }

  return {
    agents,
    defaultAgentId,
    selectedAgentId,
    workspace,
    files,
    docFiles,
    selectedFileName,
    activeFile,
    currentContent,
    loadingAgents,
    loadingFiles,
    loadingFileContent,
    saving,
    lastError,
    fetchAgents,
    fetchFiles,
    loadFile,
    saveFile,
    switchAgent,
    refresh,
    initialize,
  }
})
