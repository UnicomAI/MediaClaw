import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { useWebSocketStore } from './websocket'

export interface WizardTask {
  id: string
  scenarioId: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  assignedAgents: string[]
  priority: 'low' | 'medium' | 'high'
  mode: string
  createdAt: number
  updatedAt: number
  conversationHistory: TaskConversation[]
  executionHistory: TaskExecutionEntry[]
  sessionKey?: string
  startedAt?: number
  completedAt?: number
}

export interface TaskConversation {
  id: string
  taskId: string
  agentId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface TaskExecutionEntry {
  timestamp: number
  agentId: string
  type: 'start' | 'message' | 'error' | 'complete'
  message: string
  sessionKey?: string
  runId?: string
}

export interface WizardScenario {
  id: string
  name: string
  description: string
  status: 'confirmed' | 'executing' | 'completed' | 'archived'
  agentSelectionMode: 'existing' | 'ai_create'
  selectedAgents: string[]
  generatedAgents: GeneratedAgent[]
  tasks: WizardTask[]
  bindings: AgentBinding[]
  createdAt: number
  updatedAt: number
  executionLog: ScenarioExecutionLogEntry[]
  createdAgentIds?: string[]
}

export interface ScenarioExecutionLogEntry {
  timestamp: number
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
  taskId?: string
  agentId?: string
}

export interface GeneratedAgent {
  id: string
  name: string
  role: string
  emoji?: string
  skills?: string[]
  userMd?: string
  soulMd?: string
  agentsMd?: string
  identityMd?: string
  created: boolean
}

export interface AgentBinding {
  agentId: string
  accountId?: string
  channel: string
  peerId?: string
  peerKind?: 'direct' | 'group' | 'channel' | 'dm' | 'acp'
  peerName?: string
}

export interface ConfigUpdate {
  type: 'sessions' | 'agentToAgent' | 'bindings'
  status: 'pending' | 'completed'
  data: Record<string, unknown>
}

export interface ExecuteTaskParams {
  mode: 'sessions_seed' | 'run' | 'session'
  message?: string
}

export interface SpawnSessionParams {
  agentId: string
  label: string
  mode: 'session'
  thread?: boolean
  timeoutSeconds?: number
}

export interface SpawnSessionResult {
  sessionKey: string
}

async function apiRequest(method: string, path: string, body?: unknown) {
  const authStore = useAuthStore()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  if (authStore.token) {
    headers['Authorization'] = `Bearer ${authStore.token}`
  }
  
  const response = await fetch(`/api/wizard${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  
  const data = await response.json()
  
  if (!data.ok) {
    throw new Error(data.error?.message || 'API request failed')
  }
  
  return data
}

async function spawnSession(params: SpawnSessionParams): Promise<SpawnSessionResult> {
  const wsStore = useWebSocketStore()
  return wsStore.rpc.spawnSession({
    agentId: params.agentId,
    label: params.label,
    mode: params.mode,
    thread: params.thread,
    timeoutSeconds: params.timeoutSeconds,
  })
}

async function sendToSession(sessionKey: string, message: string): Promise<void> {
  const wsStore = useWebSocketStore()
  await wsStore.rpc.sendToSession(sessionKey, message)
}

async function getSessionHistory(sessionKey: string, limit?: number): Promise<unknown[]> {
  const wsStore = useWebSocketStore()
  return wsStore.rpc.getSessionHistory(sessionKey, limit)
}

export const useWizardStore = defineStore('wizard', () => {
  const scenarios = ref<WizardScenario[]>([])
  const tasks = ref<WizardTask[]>([])
  const currentScenario = ref<WizardScenario | null>(null)
  const currentTask = ref<WizardTask | null>(null)
  const loading = ref(false)
  const initialized = ref(false)

  const pendingTasks = computed(() => tasks.value.filter((t) => t.status === 'pending'))
  const inProgressTasks = computed(() => tasks.value.filter((t) => t.status === 'in_progress'))
  const completedTasks = computed(() => tasks.value.filter((t) => t.status === 'completed'))

  async function initialize() {
    if (initialized.value) return
    
    loading.value = true
    try {
      await loadScenarios()
      await loadTasks()
      await linkScenarioTasks()
      initialized.value = true
      console.log('[WizardStore] Initialized with SQLite backend')
    } catch (error) {
      console.error('[WizardStore] Initialize failed:', error)
    } finally {
      loading.value = false
    }
  }

  async function loadScenarios() {
    try {
      const data = await apiRequest('GET', '/scenarios')
      const rawScenarios = data.scenarios || []
      
      scenarios.value = rawScenarios.map((s: Record<string, unknown>) => ({
        id: String(s.id || ''),
        name: String(s.name || ''),
        description: String(s.description || ''),
        status: (s.status as WizardScenario['status']) || 'confirmed',
        agentSelectionMode: (s.agentSelectionMode as WizardScenario['agentSelectionMode']) || 'existing',
        selectedAgents: Array.isArray(s.selectedAgents) ? s.selectedAgents as string[] : [],
        generatedAgents: Array.isArray(s.generatedAgents) ? s.generatedAgents as GeneratedAgent[] : [],
        tasks: [],
        bindings: Array.isArray(s.bindings) ? s.bindings as AgentBinding[] : [],
        createdAt: Number(s.createdAt) || Date.now(),
        updatedAt: Number(s.updatedAt) || Date.now(),
        executionLog: Array.isArray(s.executionLog) ? s.executionLog as ScenarioExecutionLogEntry[] : [],
      }))
      
      console.log('[WizardStore] Loaded scenarios from SQLite:', scenarios.value.length)
    } catch (error) {
      console.error('[WizardStore] Load scenarios failed:', error)
      scenarios.value = []
    }
  }

  async function loadTasks() {
    try {
      const data = await apiRequest('GET', '/tasks')
      const rawTasks = data.tasks || []
      
      tasks.value = rawTasks.map((t: Record<string, unknown>) => ({
        id: String(t.id || ''),
        scenarioId: String(t.scenarioId || ''),
        title: String(t.title || ''),
        description: String(t.description || ''),
        status: (t.status as WizardTask['status']) || 'pending',
        assignedAgents: Array.isArray(t.assignedAgents) ? t.assignedAgents as string[] : [],
        priority: (t.priority as WizardTask['priority']) || 'medium',
        mode: String(t.mode || 'default'),
        createdAt: Number(t.createdAt) || Date.now(),
        updatedAt: Number(t.updatedAt) || Date.now(),
        conversationHistory: Array.isArray(t.conversationHistory) ? t.conversationHistory as TaskConversation[] : [],
        executionHistory: Array.isArray(t.executionHistory) ? t.executionHistory as TaskExecutionEntry[] : [],
      }))
      
      console.log('[WizardStore] Loaded tasks from SQLite:', tasks.value.length)
    } catch (error) {
      console.error('[WizardStore] Load tasks failed:', error)
      tasks.value = []
    }
  }

  function linkScenarioTasks() {
    for (const scenario of scenarios.value) {
      scenario.tasks = tasks.value.filter((t) => t.scenarioId === scenario.id)
    }
    console.log('[WizardStore] Linked tasks to scenarios')
  }

  function createScenario(params: Partial<WizardScenario>): WizardScenario {
    const now = Date.now()
    const scenario: WizardScenario = {
      id: params.id || `scenario-${now}`,
      name: params.name || '',
      description: params.description || '',
      status: params.status || 'confirmed',
      agentSelectionMode: params.agentSelectionMode || 'existing',
      selectedAgents: params.selectedAgents || [],
      generatedAgents: params.generatedAgents || [],
      tasks: params.tasks || [],
      bindings: params.bindings || [],
      createdAt: params.createdAt || now,
      updatedAt: params.updatedAt || now,
      executionLog: params.executionLog || [],
    }
    return scenario
  }

  async function saveScenario(scenario: WizardScenario) {
    try {
      const existing = scenarios.value.find((s) => s.id === scenario.id)
      scenario.updatedAt = Date.now()
      
      const scenarioData = {
        name: scenario.name,
        description: scenario.description,
        status: scenario.status,
        agentSelectionMode: scenario.agentSelectionMode,
        selectedAgents: scenario.selectedAgents,
        generatedAgents: scenario.generatedAgents,
        bindings: scenario.bindings,
        tasks: scenario.tasks?.map(t => t.id),
        executionLog: scenario.executionLog,
      }
      
      if (existing) {
        await apiRequest('PUT', `/scenarios/${scenario.id}`, scenarioData)
        
        const index = scenarios.value.findIndex((s) => s.id === scenario.id)
        if (index >= 0) {
          scenarios.value[index] = { ...scenario }
        }
      } else {
        const data = await apiRequest('POST', '/scenarios', scenarioData)
        
        if (data.scenario) {
          scenario.id = data.scenario.id
          scenario.createdAt = data.scenario.createdAt
          scenario.updatedAt = data.scenario.updatedAt
        }
        
        scenarios.value.push({ ...scenario })
      }
      
      console.log('[WizardStore] Scenario saved to SQLite:', scenario.id, scenario.name, scenario.status)
    } catch (error) {
      console.error('[WizardStore] Save scenario failed:', error)
      throw error
    }
  }

  async function addScenarioExecutionLog(
    scenarioId: string,
    entry: Omit<ScenarioExecutionLogEntry, 'timestamp'>
  ) {
    const scenario = scenarios.value.find((s) => s.id === scenarioId)
    if (scenario) {
      scenario.executionLog.push({
        ...entry,
        timestamp: Date.now(),
      })
      await saveScenario(scenario)
    }
  }

  async function deleteScenario(scenarioId: string) {
    try {
      await apiRequest('DELETE', `/scenarios/${scenarioId}`)
      scenarios.value = scenarios.value.filter((s) => s.id !== scenarioId)
      tasks.value = tasks.value.filter((t) => t.scenarioId !== scenarioId)
      console.log('[WizardStore] Scenario deleted from SQLite:', scenarioId)
    } catch (error) {
      console.error('[WizardStore] Delete scenario failed:', error)
      throw error
    }
  }

  function createTask(params: Partial<WizardTask>): WizardTask {
    const now = Date.now()
    const task: WizardTask = {
      id: params.id || `task-${now}`,
      scenarioId: params.scenarioId || '',
      title: params.title || '',
      description: params.description || '',
      status: params.status || 'pending',
      assignedAgents: params.assignedAgents || [],
      priority: params.priority || 'medium',
      mode: params.mode || 'default',
      createdAt: params.createdAt || now,
      updatedAt: params.updatedAt || now,
      conversationHistory: params.conversationHistory || [],
      executionHistory: params.executionHistory || [],
      sessionKey: params.sessionKey,
      startedAt: params.startedAt,
      completedAt: params.completedAt,
    }
    return task
  }

  async function saveTask(task: WizardTask) {
    try {
      const existing = tasks.value.find((t) => t.id === task.id)
      task.updatedAt = Date.now()
      
      const taskData = {
        scenarioId: task.scenarioId,
        title: task.title,
        description: task.description,
        status: task.status,
        assignedAgents: task.assignedAgents,
        priority: task.priority,
        mode: task.mode,
        conversationHistory: task.conversationHistory,
        executionHistory: task.executionHistory,
      }
      
      if (existing) {
        await apiRequest('PUT', `/tasks/${task.id}`, taskData)
        
        const index = tasks.value.findIndex((t) => t.id === task.id)
        if (index >= 0) {
          tasks.value[index] = { ...task }
        }
      } else {
        const data = await apiRequest('POST', '/tasks', taskData)
        
        if (data.task) {
          task.id = data.task.id
          task.createdAt = data.task.createdAt
          task.updatedAt = data.task.updatedAt
        }
        
        tasks.value.push({ ...task })
        
        const scenario = scenarios.value.find((s) => s.id === task.scenarioId)
        if (scenario && !scenario.tasks.some(t => t.id === task.id)) {
          scenario.tasks.push(task)
        }
      }
      
      console.log('[WizardStore] Task saved to SQLite:', task.id, task.title, task.status)
    } catch (error) {
      console.error('[WizardStore] Save task failed:', error)
      throw error
    }
  }

  async function addTaskExecutionEntry(
    taskId: string,
    entry: Omit<TaskExecutionEntry, 'timestamp'>
  ) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (task) {
      task.executionHistory.push({
        ...entry,
        timestamp: Date.now(),
      })
      await saveTask(task)
    }
  }

  async function deleteTask(taskId: string) {
    try {
      await apiRequest('DELETE', `/tasks/${taskId}`)
      tasks.value = tasks.value.filter((t) => t.id !== taskId)
      console.log('[WizardStore] Task deleted from SQLite:', taskId)
    } catch (error) {
      console.error('[WizardStore] Delete task failed:', error)
      throw error
    }
  }

  function setCurrentScenario(scenario: WizardScenario | null) {
    currentScenario.value = scenario
  }

  function setCurrentTask(task: WizardTask | null) {
    currentTask.value = task
  }

  async function addConversationToTask(taskId: string, conversation: TaskConversation) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (task) {
      if (!conversation.id) {
        conversation.id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      }
      if (!conversation.timestamp) {
        conversation.timestamp = Date.now()
      }
      conversation.taskId = taskId
      task.conversationHistory.push(conversation)
      await saveTask(task)
      console.log('[WizardStore] Added conversation to task:', taskId, conversation.role)
    }
  }

  async function updateTaskStatus(taskId: string, status: WizardTask['status']) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (task) {
      task.status = status
      
      if (status === 'in_progress') {
        task.startedAt = Date.now()
      }
      
      if (status === 'completed' || status === 'failed') {
        task.completedAt = Date.now()
        task.executionHistory.push({
          agentId: 'system',
          type: 'complete',
          message: status === 'completed' ? '任务已完成' : '任务执行失败',
          timestamp: Date.now(),
        })
      }
      
      await saveTask(task)
    }
  }

  async function executeTask(taskId: string, params?: ExecuteTaskParams): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) {
      console.error('[WizardStore] Task not found:', taskId)
      throw new Error('Task not found')
    }

    if (task.status !== 'pending') {
      console.warn('[WizardStore] Task is not pending:', taskId, task.status)
      return
    }

    const wsStore = useWebSocketStore()
    const mode = params?.mode || (task.mode as ExecuteTaskParams['mode']) || 'run'

    await updateTaskStatus(taskId, 'in_progress')
    
    addTaskExecutionEntry(taskId, {
      agentId: 'system',
      type: 'start',
      message: `开始执行任务: ${task.title} (模式: ${mode})`,
    })

    addScenarioExecutionLog(task.scenarioId, {
      type: 'info',
      taskId,
      message: `开始执行任务: ${task.title}`,
    })

    const coordinatorId = task.assignedAgents[0]
    if (!coordinatorId) {
      addTaskExecutionEntry(taskId, {
        agentId: 'system',
        type: 'error',
        message: '未指定执行者 Agent',
      })
      await updateTaskStatus(taskId, 'failed')
      throw new Error('No agent assigned to task')
    }

    let taskMessage = `【任务】${task.title}\n\n`
    if (task.description) {
      taskMessage += `描述: ${task.description}\n\n`
    }
    
    const otherAgents = task.assignedAgents.slice(1)
    if (otherAgents.length > 0) {
      taskMessage += `协作 Agent:\n`
      otherAgents.forEach(agentId => {
        taskMessage += `- ${agentId}\n`
      })
      taskMessage += `\n你可以使用 sessions_send 工具与他们协作。\n\n`
    }
    
    if (params?.message) {
      taskMessage += `附加指令: ${params.message}\n\n`
    }
    
    taskMessage += `请开始执行此任务。`

    const sessionKey = `agent:${coordinatorId}:main:dm:task-${taskId}-${Date.now()}`
    
    addTaskExecutionEntry(taskId, {
      agentId: coordinatorId,
      type: 'start',
      message: `向 ${coordinatorId} 发送任务指令`,
      sessionKey,
    })

    try {
      const result = await wsStore.rpc.callAgent({
        sessionKey,
        message: taskMessage,
        idempotencyKey: `task-${taskId}-${Date.now()}`,
      }) as { runId?: string; status?: string } | undefined

      task.sessionKey = sessionKey
      await saveTask(task)

      addTaskExecutionEntry(taskId, {
        agentId: coordinatorId,
        type: 'message',
        message: `任务已发送 (Run ID: ${result?.runId || 'N/A'})`,
        sessionKey,
        runId: result?.runId,
      })

      addScenarioExecutionLog(task.scenarioId, {
        type: 'success',
        taskId,
        agentId: coordinatorId,
        message: `${coordinatorId} 已接收任务`,
      })

      await addConversationToTask(taskId, {
        id: `conv-${Date.now()}`,
        taskId,
        agentId: coordinatorId,
        role: 'user',
        content: taskMessage,
        timestamp: Date.now(),
      })

      console.log('[WizardStore] Task execution initiated:', taskId, mode)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      
      addTaskExecutionEntry(taskId, {
        agentId: coordinatorId,
        type: 'error',
        message: `执行失败: ${errorMsg}`,
        sessionKey: task.sessionKey,
      })

      addScenarioExecutionLog(task.scenarioId, {
        type: 'error',
        taskId,
        agentId: coordinatorId,
        message: `任务执行失败: ${errorMsg}`,
      })

      await updateTaskStatus(taskId, 'failed')
      throw error
    }
  }

  async function executeScenarioTasks(scenarioId: string): Promise<void> {
    const scenario = scenarios.value.find((s) => s.id === scenarioId)
    if (!scenario) {
      console.error('[WizardStore] Scenario not found:', scenarioId)
      throw new Error('Scenario not found')
    }

    addScenarioExecutionLog(scenarioId, {
      type: 'info',
      message: '开始执行场景任务',
    })

    const pendingTasksList = tasks.value.filter(
      (t) => t.scenarioId === scenarioId && t.status === 'pending'
    )

    for (const task of pendingTasksList) {
      try {
        await executeTask(task.id)
      } catch (error) {
        console.error('[WizardStore] Task execution failed:', task.id, error)
      }
    }

    addScenarioExecutionLog(scenarioId, {
      type: 'success',
      message: '所有任务执行完成',
    })

    await saveScenario(scenario)
  }

  return {
    scenarios,
    tasks,
    currentScenario,
    currentTask,
    loading,
    initialized,
    pendingTasks,
    inProgressTasks,
    completedTasks,
    initialize,
    loadScenarios,
    loadTasks,
    createScenario,
    saveScenario,
    deleteScenario,
    addScenarioExecutionLog,
    createTask,
    saveTask,
    deleteTask,
    addTaskExecutionEntry,
    addConversationToTask,
    updateTaskStatus,
    executeTask,
    executeScenarioTasks,
    setCurrentScenario,
    setCurrentTask,
    spawnSession,
    sendToSession,
    getSessionHistory,
  }
})
