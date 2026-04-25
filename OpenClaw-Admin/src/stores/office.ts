import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import { useAgentStore } from './agent'
import { useSessionStore } from './session'
import { useChatStore } from './chat'
import type { AgentInfo } from '@/api/types'

export interface OfficeAgent {
  id: string
  name: string
  emoji?: string
  avatar?: string
  color: string
  status: 'idle' | 'working' | 'communicating' | 'offline'
  currentTask?: string
  position: { x: number; y: number; z?: number }
  workspace?: string
  model?: string
  sessionCount: number
  totalTokens: number
  isNewlyCreated?: boolean
  lastActivity?: string
  hasActiveSessions: boolean
  identity?: {
    name?: string
    theme?: string
    emoji?: string
    avatar?: string
  }
  toolPolicy?: {
    allow?: string[]
    deny?: string[]
  }
}

export interface OfficeTask {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  assignedTo: string[]
  createdBy: string
  createdAt: number
  updatedAt: number
  priority: 'low' | 'medium' | 'high'
  progress: number
  executionLog?: ExecutionLogEntry[]
}

export interface ExecutionLogEntry {
  timestamp: number
  agentId: string
  type: 'info' | 'success' | 'error' | 'warning' | 'message'
  message: string
}

export interface OfficeMessage {
  id: string
  fromAgent: string
  toAgent: string | 'all'
  content: string
  timestamp: number
  type: 'task' | 'question' | 'answer' | 'notification' | 'collaboration'
}

export interface Scenario {
  id: string
  name: string
  description: string
  agents: string[]
  tasks: OfficeTask[]
  status: 'draft' | 'active' | 'completed' | 'archived'
  createdAt: number
  executionLog?: ExecutionLogEntry[]
}

export interface AgentTemplate {
  id: string
  name: string
  role: string
  emoji?: string
  skills?: string[]
}

export type ViewMode = '2d' | '3d'
export type AgentSelectionMode = 'existing' | 'ai_create'

const AGENT_COLORS = [
  '#667eea', '#764ba2', '#f093fb', '#f5576c',
  '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
  '#fa709a', '#fee140', '#a8edea', '#fed6e3',
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
]

export const useOfficeStore = defineStore('office', () => {
  const wsStore = useWebSocketStore()
  const agentStore = useAgentStore()
  const sessionStore = useSessionStore()
  const chatStore = useChatStore()

  const viewMode = ref<ViewMode>('2d')
  const currentScenario = ref<Scenario | null>(null)
  const scenarios = ref<Scenario[]>([])
  const tasks = ref<OfficeTask[]>([])
  const messages = ref<OfficeMessage[]>([])
  const selectedAgentId = ref<string | null>(null)
  const selectedSessionKey = ref<string | null>(null)
  const wizardStep = ref<'scenario' | 'agents' | 'tasks' | 'delegation' | 'running'>('scenario')
  const wizardVisible = ref(false)
  const loading = ref(false)
  const error = ref('')
  const executionInProgress = ref(false)
  const pendingAgentCreations = ref<AgentTemplate[]>([])

  const officeAgents = computed<OfficeAgent[]>(() => {
    const agents = agentStore.agents
    if (agents.length === 0) return []

    const currentSessionKey = chatStore.sessionKey
    let activeAgentId: string | null = null
    if (currentSessionKey) {
      const match = currentSessionKey.match(/^agent:([^:]+):/)
      if (match && match[1]) {
        activeAgentId = match[1]
      }
    }

    return agents.map((agent, index) => {
      const agentSessions = sessionStore.sessions.filter((s) => s.agentId === agent.id)
      const totalTokens = agentSessions.reduce((sum, s) => sum + (s.tokenUsage?.totalInput || 0) + (s.tokenUsage?.totalOutput || 0), 0)
      const color: string = AGENT_COLORS[index % AGENT_COLORS.length]!
      const angle = (index / agents.length) * Math.PI * 2
      const radius = 200
      
      const now = Date.now()
      const hasActiveSessions = agentSessions.some((s) => {
        const lastActivity = new Date(s.lastActivity).getTime()
        const diffMins = (now - lastActivity) / (1000 * 60)
        return diffMins < 5
      })
      
      const lastActivity = agentSessions.length > 0
        ? agentSessions
            .map((s) => new Date(s.lastActivity).getTime())
            .sort((a, b) => b - a)[0]
        : undefined

      // 获取智能体的状态
      const agentStatus = chatStore.getOrCreateAgentStatus(agent.id)
      const currentPhase = agentStatus.phase
      const isActivePhase = currentPhase !== 'idle' && currentPhase !== 'done' && currentPhase !== 'error' && currentPhase !== 'aborted'
      
      // 检查智能体是否是当前活跃的智能体
      const isCurrentlyActive = activeAgentId === agent.id && isActivePhase
      let status: OfficeAgent['status'] = 'offline'
      
      // 优先检查当前活跃的智能体
      if (isCurrentlyActive || isActivePhase) {
        status = 'working'
      } 
      // 然后检查是否有活跃的会话
      else if (hasActiveSessions) {
        status = 'working'
      } 
      // 最后检查是否有会话记录
      else if (agentSessions.length > 0) {
        status = 'idle'
      }

      return {
        id: agent.id,
        name: agent.name || agent.id,
        emoji: agent.identity?.emoji,
        avatar: agent.identity?.avatarUrl || agent.identity?.avatar,
        color,
        status,
        currentTask: isActivePhase ? agentStatus.detail || currentPhase : undefined,
        position: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          z: 0,
        },
        workspace: undefined,
        model: agent.model,
        sessionCount: agentSessions.length,
        totalTokens,
        lastActivity: lastActivity ? new Date(lastActivity).toISOString() : undefined,
        hasActiveSessions,
        identity: agent.identity ? {
          name: agent.identity.name,
          theme: agent.identity.theme,
          emoji: agent.identity.emoji,
          avatar: agent.identity.avatar,
        } : undefined,
        toolPolicy: agent.tools ? {
          allow: agent.tools.allow,
          deny: agent.tools.deny,
        } : undefined,
      }
    })
  })

  const selectedAgent = computed(() => {
    if (!selectedAgentId.value) return null
    return officeAgents.value.find((a) => a.id === selectedAgentId.value) || null
  })

  const agentSessions = computed(() => {
    if (!selectedAgentId.value) return []
    return sessionStore.sessions
      .filter((s) => s.agentId === selectedAgentId.value)
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
  })

  const selectedSession = computed(() => {
    if (!selectedSessionKey.value) return null
    return sessionStore.sessions.find((s) => s.key === selectedSessionKey.value) || null
  })

  const activeTasks = computed(() => 
    tasks.value.filter((t) => t.status === 'in_progress')
  )

  const pendingTasks = computed(() => 
    tasks.value.filter((t) => t.status === 'pending')
  )

  const completedTasks = computed(() => 
    tasks.value.filter((t) => t.status === 'completed')
  )

  const recentMessages = computed(() => 
    [...messages.value].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20)
  )

  const agentMessages = computed(() => {
    if (!selectedAgentId.value) return []
    return messages.value.filter(
      (m) => m.fromAgent === selectedAgentId.value || m.toAgent === selectedAgentId.value || m.toAgent === 'all'
    )
  })

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode
  }

  function selectAgent(agentId: string | null) {
    selectedAgentId.value = agentId
    selectedSessionKey.value = null
  }

  function selectSession(sessionKey: string | null) {
    selectedSessionKey.value = sessionKey
  }

  function setWizardStep(step: 'scenario' | 'agents' | 'tasks' | 'delegation' | 'running') {
    wizardStep.value = step
  }

  function showWizard() {
    wizardVisible.value = true
  }

  function hideWizard() {
    wizardVisible.value = false
  }

  function addExecutionLog(
    target: Scenario | OfficeTask,
    entry: Omit<ExecutionLogEntry, 'timestamp'>
  ) {
    const logEntry: ExecutionLogEntry = {
      ...entry,
      timestamp: Date.now(),
    }
    if (!target.executionLog) {
      target.executionLog = []
    }
    target.executionLog.push(logEntry)
  }

  function createScenario(params: { name: string; description: string }): Scenario {
    const scenario: Scenario = {
      id: `scenario-${Date.now()}`,
      name: params.name,
      description: params.description,
      agents: [],
      tasks: [],
      status: 'draft',
      createdAt: Date.now(),
      executionLog: [],
    }
    scenarios.value.push(scenario)
    currentScenario.value = scenario
    addExecutionLog(scenario, {
      agentId: 'system',
      type: 'info',
      message: `场景 "${params.name}" 已创建`,
    })
    return scenario
  }

  function updateScenario(scenarioId: string, updates: Partial<Scenario>) {
    const index = scenarios.value.findIndex((s) => s.id === scenarioId)
    if (index >= 0) {
      const updated = { ...scenarios.value[index], ...updates } as Scenario
      scenarios.value[index] = updated
      if (currentScenario.value?.id === scenarioId) {
        currentScenario.value = updated
      }
    }
  }

  async function activateScenario(scenarioId: string) {
    const scenario = scenarios.value.find((s) => s.id === scenarioId)
    if (scenario) {
      scenario.status = 'active'
      currentScenario.value = scenario
      addExecutionLog(scenario, {
        agentId: 'system',
        type: 'info',
        message: '场景已激活，准备执行任务',
      })
    }
  }

  async function executeScenario() {
    console.log('[Office] executeScenario called')
    
    const scenario = currentScenario.value
    console.log('[Office] Current scenario:', scenario)
    console.log('[Office] All tasks:', tasks.value)
    
    if (!scenario) {
      console.log('[Office] No scenario, returning')
      return
    }

    executionInProgress.value = true
    addExecutionLog(scenario, {
      agentId: 'system',
      type: 'info',
      message: '开始执行场景任务...',
    })

    const pendingTasksList = tasks.value.filter(
      (t) => t.status === 'pending' && scenario.tasks.some((st) => st.id === t.id)
    )
    
    console.log('[Office] Pending tasks to execute:', pendingTasksList)
    console.log('[Office] Scenario tasks:', scenario.tasks)

    for (const task of pendingTasksList) {
      console.log('[Office] Executing task:', task.id, task.title)
      await executeTask(task.id)
    }

    executionInProgress.value = false
    addExecutionLog(scenario, {
      agentId: 'system',
      type: 'success',
      message: '所有任务执行完成',
    })
  }

  async function executeTask(taskId: string) {
    console.log('[Office] executeTask called with taskId:', taskId)
    
    const task = tasks.value.find((t) => t.id === taskId)
    console.log('[Office] Found task:', task)
    
    if (!task || task.status !== 'pending') {
      console.log('[Office] Task not found or not pending, returning')
      return
    }

    const scenario = currentScenario.value
    if (!scenario) {
      console.log('[Office] No current scenario, returning')
      return
    }

    updateTask(taskId, { status: 'in_progress' })
    addExecutionLog(scenario, {
      agentId: 'system',
      type: 'info',
      message: `开始执行任务: ${task.title}`,
    })

    const coordinatorId = task.assignedTo[0]
    console.log('[Office] Coordinator ID:', coordinatorId)
    console.log('[Office] Assigned agents:', task.assignedTo)
    
    if (!coordinatorId) {
      addExecutionLog(scenario, {
        agentId: 'system',
        type: 'error',
        message: '未指定协调者 Agent',
      })
      return
    }

    const otherAgents = task.assignedTo.slice(1)
    const sessionKey = `agent:${coordinatorId}:main:dm:task-${Date.now()}`
    
    console.log('[Office] Session Key:', sessionKey)
    
    let taskMessage = `任务: ${task.title}\n\n描述: ${task.description}\n\n`
    
    if (otherAgents.length > 0) {
      taskMessage += `你可以协调以下 Agent 来完成此任务:\n`
      otherAgents.forEach(agentId => {
        taskMessage += `- ${agentId}\n`
      })
      taskMessage += `\n请使用 sessions_send 工具与他们协作，完成后汇总结果。\n`
    }
    
    taskMessage += `\n请开始执行此任务。`

    console.log('[Office] Task message:', taskMessage)
    console.log('[Office] Calling callAgent with params:', {
      sessionKey,
      messageLength: taskMessage.length,
      idempotencyKey: `task-${taskId}-${Date.now()}`,
    })

    try {
      addExecutionLog(scenario, {
        agentId: coordinatorId,
        type: 'info',
        message: `正在向协调者 ${coordinatorId} 发送任务...`,
      })

      console.log('[Office] wsStore.rpc:', wsStore.rpc)
      console.log('[Office] wsStore.state:', wsStore.state)
      
      const result = await wsStore.rpc.callAgent({
        sessionKey,
        message: taskMessage,
        idempotencyKey: `task-${taskId}-${Date.now()}`,
      }) as { runId?: string; status?: string } | undefined

      console.log('[Office] callAgent result:', result)

      addExecutionLog(scenario, {
        agentId: coordinatorId,
        type: 'success',
        message: `${coordinatorId} 已接收任务 (Run ID: ${result?.runId || 'N/A'})`,
      })

      updateAgentStatus(coordinatorId, 'working', task.title)

      otherAgents.forEach(agentId => {
        updateAgentStatus(agentId, 'communicating', `等待 ${coordinatorId} 的指令`)
      })

      addMessage({
        fromAgent: coordinatorId,
        toAgent: 'user',
        content: `我已收到任务"${task.title}"，正在处理中...${otherAgents.length > 0 ? ` 我会协调其他 Agent 共同完成。` : ''}`,
        type: 'task',
      })

      updateTask(taskId, { progress: 30 })

    } catch (e) {
      console.error('[Office] callAgent error:', e)
      const errorMsg = e instanceof Error ? e.message : 'Unknown error'
      addExecutionLog(scenario, {
        agentId: coordinatorId,
        type: 'error',
        message: `向 ${coordinatorId} 发送任务失败: ${errorMsg}`,
      })
    }
  }

  function createTask(params: {
    title: string
    description: string
    assignedTo: string[]
    priority: 'low' | 'medium' | 'high'
  }): OfficeTask {
    const task: OfficeTask = {
      id: `task-${Date.now()}`,
      title: params.title,
      description: params.description,
      status: 'pending',
      assignedTo: params.assignedTo,
      createdBy: 'user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      priority: params.priority,
      progress: 0,
      executionLog: [],
    }
    console.log('[Office] Creating task:', task)
    console.log('[Office] Current scenario:', currentScenario.value)
    
    tasks.value.push(task)
    if (currentScenario.value) {
      currentScenario.value.tasks.push(task)
      console.log('[Office] Added task to scenario, scenario.tasks:', currentScenario.value.tasks)
    }
    console.log('[Office] All tasks:', tasks.value)
    return task
  }

  function updateTask(taskId: string, updates: Partial<OfficeTask>) {
    const index = tasks.value.findIndex((t) => t.id === taskId)
    if (index >= 0) {
      const updated = {
        ...tasks.value[index],
        ...updates,
        updatedAt: Date.now(),
      } as OfficeTask
      tasks.value[index] = updated
    }
  }

  function startTask(taskId: string) {
    updateTask(taskId, { status: 'in_progress' })
  }

  function completeTask(taskId: string, progress: number = 100) {
    updateTask(taskId, { status: 'completed', progress })
    const task = tasks.value.find((t) => t.id === taskId)
    if (task && currentScenario.value) {
      addExecutionLog(currentScenario.value, {
        agentId: 'system',
        type: 'success',
        message: `任务 "${task.title}" 已完成`,
      })
    }
  }

  function failTask(taskId: string) {
    updateTask(taskId, { status: 'failed' })
    const task = tasks.value.find((t) => t.id === taskId)
    if (task && currentScenario.value) {
      addExecutionLog(currentScenario.value, {
        agentId: 'system',
        type: 'error',
        message: `任务 "${task.title}" 执行失败`,
      })
    }
  }

  function addMessage(params: {
    fromAgent: string
    toAgent: string | 'all'
    content: string
    type: OfficeMessage['type']
  }) {
    const message: OfficeMessage = {
      id: `msg-${Date.now()}`,
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      content: params.content,
      timestamp: Date.now(),
      type: params.type,
    }
    messages.value.push(message)
  }

  function updateAgentStatus(agentId: string, status: OfficeAgent['status'], currentTask?: string) {
    const agent = officeAgents.value.find((a) => a.id === agentId)
    if (agent) {
      agent.status = status
      agent.currentTask = currentTask
    }
  }

  async function delegateTaskToAgent(taskId: string, agentId: string) {
    const task = tasks.value.find((t) => t.id === taskId)
    if (task && !task.assignedTo.includes(agentId)) {
      task.assignedTo.push(agentId)
      addMessage({
        fromAgent: 'user',
        toAgent: agentId,
        content: `新任务委派：${task.title}`,
        type: 'task',
      })
    }
  }

  async function sendMessageToAgent(agentId: string, content: string) {
    addMessage({
      fromAgent: 'user',
      toAgent: agentId,
      content,
      type: 'question',
    })
  }

  async function broadcastToAllAgents(content: string) {
    addMessage({
      fromAgent: 'user',
      toAgent: 'all',
      content,
      type: 'notification',
    })
  }

  async function spawnAgentTask(agentId: string, task: string) {
    try {
      const sessionKey = `agent:${agentId}:main:dm:spawn-${Date.now()}`
      const result = await wsStore.rpc.callAgent({
        sessionKey,
        message: task,
        idempotencyKey: `spawn-${agentId}-${Date.now()}`,
      })
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to spawn agent task'
      throw e
    }
  }

  async function createAgentFromTemplate(template: AgentTemplate): Promise<string> {
    const agentId = template.id || `agent-${Date.now()}`
    
    try {
      await agentStore.addAgent({
        id: agentId,
        name: template.name,
        workspace: `~/.openclaw/workspace-${agentId}`,
      })

      if (template.emoji) {
        await agentStore.setAgentIdentity({
          agentId,
          emoji: template.emoji,
          name: template.name,
        })
      }

      await agentStore.fetchAgents()
      
      return agentId
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to create agent'
      error.value = errorMsg
      throw new Error(errorMsg)
    }
  }

  async function createAgentsFromTemplates(templates: AgentTemplate[]): Promise<string[]> {
    const createdIds: string[] = []
    
    for (const template of templates) {
      try {
        const agentId = await createAgentFromTemplate(template)
        createdIds.push(agentId)
        
        if (currentScenario.value) {
          addExecutionLog(currentScenario.value, {
            agentId: 'system',
            type: 'success',
            message: `已创建智能体: ${template.name} (${template.role})`,
          })
        }
      } catch (e) {
        if (currentScenario.value) {
          addExecutionLog(currentScenario.value, {
            agentId: 'system',
            type: 'error',
            message: `创建智能体 ${template.name} 失败`,
          })
        }
      }
    }
    
    return createdIds
  }

  function setPendingAgentCreations(templates: AgentTemplate[]) {
    pendingAgentCreations.value = templates
  }

  async function loadOfficeData() {
    loading.value = true
    error.value = ''
    try {
      await Promise.all([
        agentStore.fetchAgents(),
        sessionStore.fetchSessions(),
      ])
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load office data'
    } finally {
      loading.value = false
    }
  }

  return {
    viewMode,
    currentScenario,
    scenarios,
    tasks,
    messages,
    selectedAgentId,
    selectedSessionKey,
    wizardStep,
    wizardVisible,
    loading,
    error,
    executionInProgress,
    pendingAgentCreations,
    officeAgents,
    selectedAgent,
    agentSessions,
    selectedSession,
    activeTasks,
    pendingTasks,
    completedTasks,
    recentMessages,
    agentMessages,
    setViewMode,
    selectAgent,
    selectSession,
    setWizardStep,
    showWizard,
    hideWizard,
    addExecutionLog,
    createScenario,
    updateScenario,
    activateScenario,
    executeScenario,
    executeTask,
    createTask,
    updateTask,
    startTask,
    completeTask,
    failTask,
    addMessage,
    updateAgentStatus,
    delegateTaskToAgent,
    sendMessageToAgent,
    broadcastToAllAgents,
    spawnAgentTask,
    createAgentFromTemplate,
    createAgentsFromTemplates,
    setPendingAgentCreations,
    loadOfficeData,
  }
})
