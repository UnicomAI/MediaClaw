<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  NCard,
  NButton,
  NSpace,
  NText,
  NTag,
  NIcon,
  NEmpty,
  NModal,
  NInput,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NCheckbox,
  NCheckboxGroup,
  NSelect,
  NStatistic,
  NGrid,
  NGi,
  NFormItem,
  NForm,
  NRadioGroup,
  NRadio,
  NSpin,
  NAlert,
  NTooltip,
  NProgress,
  useMessage,
  type SelectOption,
} from 'naive-ui'
import {
  PeopleOutline,
  TrashOutline,
  RefreshOutline,
  TimeOutline,
  AddOutline,
  CreateOutline,
  PlayOutline,
  ListOutline,
  CloseOutline,
  SparklesOutline,
  LinkOutline,
  ChatbubbleOutline,
  CheckmarkOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import {
  useWizardStore,
  type WizardScenario,
  type WizardTask,
  type GeneratedAgent,
  type AgentBinding,
} from '@/stores/wizard'
import { useAgentStore } from '@/stores/agent'
import { useWebSocketStore } from '@/stores/websocket'
import { useSessionStore } from '@/stores/session'
import { useConfigStore } from '@/stores/config'
import { formatRelativeTime } from '@/utils/format'

const emit = defineEmits<{
  (e: 'view-task', task: WizardTask): void
  (e: 'open-session', agentId: string): void
}>()

const { t } = useI18n()
const message = useMessage()
const wizardStore = useWizardStore()
const agentStore = useAgentStore()
const sessionStore = useSessionStore()
const wsStore = useWebSocketStore()
const configStore = useConfigStore()

const selectedTeamId = ref<string | null>(null)
const showEditTeamModal = ref(false)
const showTeamDetailModal = ref(false)
const showDeleteTeamModal = ref(false)
const showCreateTaskModal = ref(false)
const showEditTaskModal = ref(false)
const showDeleteTaskModal = ref(false)
const showBindingDetailModal = ref(false)
const showEditBindingModal = ref(false)

const editTeamForm = ref({
  name: '',
  description: '',
  selectedMembers: [] as string[],
  bindings: [] as AgentBinding[],
})

const newTaskForm = ref({
  title: '',
  description: '',
  priority: 'medium' as 'low' | 'medium' | 'high',
  mode: 'run' as 'run' | 'session',
  assignedAgents: [] as string[],
})

const deleteAgentOption = ref<'team_only' | 'all'>('team_only')
const taskToDelete = ref<WizardTask | null>(null)
const bindingToEdit = ref<AgentBinding | null>(null)
const bindingIndexToEdit = ref<number>(-1)

const isDeleting = ref(false)
const deleteProgress = ref({
  total: 0,
  current: 0,
  success: 0,
  failed: 0,
  currentAgentName: '',
})

const newBindingForm = ref({
  agentId: '',
  channel: '',
  peerId: '',
  peerKind: 'group' as 'direct' | 'group' | 'channel' | 'dm' | 'acp',
})

const scenarios = computed(() => {
  return wizardStore.scenarios
})
const selectedTeam = computed(() =>
  wizardStore.scenarios.find((s) => s.id === selectedTeamId.value)
)

const teamTasks = computed(() => {
  if (!selectedTeamId.value) return []
  return wizardStore.tasks.filter((t) => t.scenarioId === selectedTeamId.value)
})

const taskStats = computed(() => {
  const tasks = teamTasks.value
  return {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  }
})

const agentOptions = computed<SelectOption[]>(() => {
  return agentStore.agents.map((agent) => ({
    label: `${agent.identity?.emoji || '🤖'} ${agent.name || agent.id}`,
    value: agent.id,
  }))
})

const teamMemberOptions = computed<SelectOption[]>(() => {
  if (!selectedTeam.value) return agentOptions.value
  const members = getTeamMembers(selectedTeam.value)
  return members.map((m) => ({
    label: `${m.emoji || '🤖'} ${m.name}`,
    value: m.id,
  }))
})

const editTeamMemberOptions = computed<SelectOption[]>(() => {
  if (!selectedTeam.value) return agentOptions.value
  const members = getTeamMembers(selectedTeam.value)
  return members.map((m) => ({
    label: `${m.emoji || '🤖'} ${m.name}`,
    value: m.id,
  }))
})

onMounted(async () => {
  await agentStore.fetchAgents()
  await configStore.fetchConfig()
  await wizardStore.initialize()
})

watch(
  () => scenarios.value,
  (newScenarios) => {
    if (newScenarios.length > 0 && !selectedTeamId.value && newScenarios[0]) {
      selectedTeamId.value = newScenarios[0].id
    }
  },
  { immediate: true }
)

watch(
  () => editTeamForm.value.selectedMembers,
  (newMembers, oldMembers) => {
    syncEditTeamBindingsWithMembers(newMembers || [], oldMembers || [])
  }
)

function syncEditTeamBindingsWithMembers(newMembers: string[], oldMembers: string[]) {
  const addedMembers = newMembers.filter((id) => !oldMembers.includes(id))
  const removedMembers = oldMembers.filter((id) => !newMembers.includes(id))
  
  for (const agentId of removedMembers) {
    editTeamForm.value.bindings = editTeamForm.value.bindings.filter(
      (b) => b.agentId !== agentId
    )
  }
  
  for (const agentId of addedMembers) {
    const agentBindings = getExistingBindingsForAgent(agentId)
    const existingKeys = new Set(
      editTeamForm.value.bindings.map((b) => `${b.agentId}-${b.channel}-${b.peerId}`)
    )
    for (const b of agentBindings) {
      const key = `${b.agentId}-${b.channel}-${b.peerId}`
      if (!existingKeys.has(key)) {
        editTeamForm.value.bindings.push(b)
        existingKeys.add(key)
      }
    }
  }
}

function getTeamMembers(scenario: WizardScenario): (GeneratedAgent & { exists: boolean; actualAgentId?: string })[] {
  if (scenario.generatedAgents && scenario.generatedAgents.length > 0) {
    return scenario.generatedAgents.map((ga) => {
      const agent = agentStore.agents.find((a) => a.id === ga.id || a.name === ga.name)
      return {
        ...ga,
        exists: !!agent,
        actualAgentId: agent?.id,
      }
    })
  }
  
  if (scenario.selectedAgents && scenario.selectedAgents.length > 0) {
    return scenario.selectedAgents.map((id) => {
      const agent = agentStore.agents.find((a) => a.id === id)
      return {
        id,
        name: agent?.name || id,
        role: agent?.identity?.name || '',
        emoji: agent?.identity?.emoji || '🤖',
        skills: [],
        exists: !!agent,
        created: true,
        actualAgentId: agent?.id,
      }
    })
  }
  
  return []
}

function getTeamTaskCount(scenarioId: string): number {
  return wizardStore.tasks.filter((t) => t.scenarioId === scenarioId).length
}

function getStatusColor(status: string) {
  switch (status) {
    case 'confirmed':
      return 'info'
    case 'executing':
      return 'warning'
    case 'completed':
      return 'success'
    case 'archived':
      return 'default'
    default:
      return 'default'
  }
}

function getStatusText(status: string) {
  return t(`pages.office.teamManagement.status.${status}`)
}

function getTaskStatusColor(status: string) {
  switch (status) {
    case 'pending':
      return 'default'
    case 'in_progress':
      return 'warning'
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    default:
      return 'default'
  }
}

function getTaskStatusText(status: string) {
  return t(`pages.office.tasks.status.${status}`)
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'low':
      return 'default'
    case 'medium':
      return 'info'
    case 'high':
      return 'error'
    default:
      return 'default'
  }
}

function getPriorityText(priority: string) {
  return t(`pages.office.tasks.priority.${priority}`)
}

function getModeText(mode: string) {
  if (mode === 'session') {
    return t('pages.office.teamTaskPanel.modeSession')
  }
  return t('pages.office.teamTaskPanel.modeRun')
}

function handleSelectTeam(teamId: string) {
  selectedTeamId.value = teamId
}

function handleOpenEditTeam() {
  if (!selectedTeam.value) return
  editTeamForm.value = {
    name: selectedTeam.value.name,
    description: selectedTeam.value.description,
    selectedMembers: selectedTeam.value.agentSelectionMode === 'existing'
      ? [...selectedTeam.value.selectedAgents]
      : selectedTeam.value.generatedAgents.map((a) => a.id),
    bindings: [...(selectedTeam.value.bindings || [])],
  }
  showEditTeamModal.value = true
}

async function handleEditTeam() {
  if (!selectedTeam.value) return
  if (!editTeamForm.value.name.trim()) {
    message.warning(t('pages.office.wizard.scenarioName'))
    return
  }

  try {
    selectedTeam.value.name = editTeamForm.value.name
    selectedTeam.value.description = editTeamForm.value.description
    selectedTeam.value.bindings = editTeamForm.value.bindings
    if (selectedTeam.value.agentSelectionMode === 'existing') {
      selectedTeam.value.selectedAgents = editTeamForm.value.selectedMembers
    } else {
      const existingIds = selectedTeam.value.generatedAgents.map((a) => a.id)
      const newIds = editTeamForm.value.selectedMembers.filter((id) => !existingIds.includes(id))
      for (const newId of newIds) {
        const agent = agentStore.agents.find((a) => a.id === newId)
        if (agent) {
          selectedTeam.value.generatedAgents.push({
            id: newId,
            name: agent.name || newId,
            role: agent.identity?.name || '',
            emoji: agent.identity?.emoji || '🤖',
            skills: [],
            created: true,
          })
        }
      }
      selectedTeam.value.generatedAgents = selectedTeam.value.generatedAgents.filter(
        (a) => editTeamForm.value.selectedMembers.includes(a.id)
      )
    }
    await wizardStore.saveScenario(selectedTeam.value)

    try {
      await updateTeamConfig(selectedTeam.value)
    } catch (configError) {
      console.warn('[TeamEdit] Failed to update config:', configError)
    }

    message.success(t('common.save'))
    showEditTeamModal.value = false
  } catch (error) {
    message.error(t('common.saveFailed'))
  }
}

function handleOpenTeamDetail() {
  showTeamDetailModal.value = true
}

function handleOpenDeleteTeam() {
  deleteAgentOption.value = 'team_only'
  showDeleteTeamModal.value = true
}

async function handleConfirmDeleteTeam() {
  if (!selectedTeam.value) return

  const scenarioId = selectedTeam.value.id
  const members = getTeamMembers(selectedTeam.value)
  const actualAgentIds = members
    .filter(m => m.actualAgentId && m.actualAgentId !== 'main')
    .map(m => m.actualAgentId!)

  if (deleteAgentOption.value === 'all') {
    isDeleting.value = true
    const agentsToDelete = members.filter(m => m.exists && m.actualAgentId && m.actualAgentId !== 'main')
    deleteProgress.value = {
      total: agentsToDelete.length,
      current: 0,
      success: 0,
      failed: 0,
      currentAgentName: '',
    }
    
    console.log('[TeamDelete] agentsToDelete:', agentsToDelete.map(a => ({ id: a.id, actualAgentId: a.actualAgentId, name: a.name })))
    
    try {
      await configStore.fetchConfig()
      const currentConfig = configStore.config || {}
      
      const updatedBindings = (currentConfig.bindings || []).filter(
        (b: { agentId?: string }) => b.agentId && !actualAgentIds.includes(b.agentId)
      )
      
      const currentAllow = currentConfig.tools?.agentToAgent?.allow || []
      const updatedAllow = currentAllow.filter((id: string) => !actualAgentIds.includes(id))
      
      const updatedConfig = {
        ...currentConfig,
        tools: {
          ...currentConfig.tools,
          agentToAgent: {
            ...currentConfig.tools?.agentToAgent,
            allow: updatedAllow,
          },
        },
        bindings: updatedBindings,
      }
      
      await configStore.setConfig(updatedConfig)
    } catch (configError) {
      console.warn('[TeamDelete] 配置更新失败:', configError)
    }
    
    const deleteDelay = 500
    const maxRetries = 3
    const verifyDelay = 500
    
    for (const agent of agentsToDelete) {
      const agentIdToDelete = agent.actualAgentId!
      
      deleteProgress.value.current++
      deleteProgress.value.currentAgentName = agent.name || agentIdToDelete
      
      console.log(`[TeamDelete] 开始删除第 ${deleteProgress.value.current} 个 agent: ${agentIdToDelete} (${agent.name})`)
      
      let deleted = false
      for (let attempt = 1; attempt <= maxRetries && !deleted; attempt++) {
        try {
          console.log(`[TeamDelete] 调用 deleteAgent API, agentId: ${agentIdToDelete}, 尝试 ${attempt}/${maxRetries}`)
          await wsStore.rpc.deleteAgent(agentIdToDelete)
          
          console.log(`[TeamDelete] API 调用成功，等待 ${verifyDelay}ms 后验证...`)
          await new Promise(resolve => setTimeout(resolve, verifyDelay))
          
          console.log('[TeamDelete] 刷新 agentStore.fetchAgents()...')
          await agentStore.fetchAgents()
          
          console.log('[TeamDelete] 当前 agentStore.agents:', agentStore.agents.map(a => a.id))
          
          const stillExists = agentStore.agents.some(a => a.id === agentIdToDelete)
          console.log(`[TeamDelete] 验证结果: agent ${agentIdToDelete} ${stillExists ? '仍存在' : '已删除'}`)
          
          if (!stillExists) {
            deleted = true
            deleteProgress.value.success++
            console.log(`[TeamDelete] ✓ Agent ${agentIdToDelete} 删除成功 (尝试 ${attempt} 次)`)
          } else {
            console.warn(`[TeamDelete] Agent ${agentIdToDelete} 删除后仍存在，重试中... (尝试 ${attempt}/${maxRetries})`)
          }
        } catch (e: any) {
          console.error(`[TeamDelete] 删除 agent ${agentIdToDelete} 异常 (尝试 ${attempt}/${maxRetries}):`, e?.message || e)
        }
        
        if (!deleted && attempt < maxRetries) {
          const waitTime = deleteDelay * attempt
          console.log(`[TeamDelete] 等待 ${waitTime}ms 后重试...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
      
      if (!deleted) {
        deleteProgress.value.failed++
        console.error(`[TeamDelete] ✗ Agent ${agentIdToDelete} 删除失败，已达到最大重试次数`)
      }
      
      console.log(`[TeamDelete] 等待 ${deleteDelay}ms 后处理下一个 agent...`)
      await new Promise(resolve => setTimeout(resolve, deleteDelay))
    }
    
    console.log(`[TeamDelete] 删除完成！成功: ${deleteProgress.value.success}, 失败: ${deleteProgress.value.failed}`)
    isDeleting.value = false
  }

  await wizardStore.deleteScenario(scenarioId)
  showDeleteTeamModal.value = false
  deleteAgentOption.value = 'team_only'
  message.success(t('common.delete'))

  await agentStore.fetchAgents()

  const firstScenario = scenarios.value[0]
  if (firstScenario) {
    selectedTeamId.value = firstScenario.id
  } else {
    selectedTeamId.value = null
  }
}

function handleOpenCreateTask() {
  if (!selectedTeamId.value) return
  newTaskForm.value = {
    title: '',
    description: '',
    priority: 'medium',
    mode: 'run',
    assignedAgents: [],
  }
  showCreateTaskModal.value = true
}

function handleOpenEditTask(task: WizardTask) {
  newTaskForm.value = {
    title: task.title,
    description: task.description,
    priority: task.priority,
    mode: task.mode === 'session' ? 'session' : 'run',
    assignedAgents: [...task.assignedAgents],
  }
  taskToDelete.value = task
  showEditTaskModal.value = true
}

async function handleCreateTask() {
  if (!newTaskForm.value.title.trim()) {
    message.warning(t('pages.office.wizard.taskTitleRequired'))
    return
  }
  if (!selectedTeamId.value) return

  try {
    const task = wizardStore.createTask({
      scenarioId: selectedTeamId.value,
      title: newTaskForm.value.title,
      description: newTaskForm.value.description,
      priority: newTaskForm.value.priority,
      mode: newTaskForm.value.mode,
      assignedAgents: newTaskForm.value.assignedAgents,
      status: 'pending',
    })
    await wizardStore.saveTask(task)
    message.success(t('common.create'))
    showCreateTaskModal.value = false
  } catch (error) {
    message.error(t('common.saveFailed'))
  }
}

async function handleEditTask() {
  if (!taskToDelete.value) return
  if (!newTaskForm.value.title.trim()) {
    message.warning(t('pages.office.wizard.taskTitleRequired'))
    return
  }

  try {
    const task = wizardStore.tasks.find((t) => t.id === taskToDelete.value!.id)
    if (task) {
      task.title = newTaskForm.value.title
      task.description = newTaskForm.value.description
      task.priority = newTaskForm.value.priority
      task.mode = newTaskForm.value.mode
      task.assignedAgents = newTaskForm.value.assignedAgents
      await wizardStore.saveTask(task)
      message.success(t('common.save'))
    }
    showEditTaskModal.value = false
    taskToDelete.value = null
  } catch (error) {
    message.error(t('common.saveFailed'))
  }
}

async function handleExecuteTask(task: WizardTask) {
  if (task.status !== 'pending') {
    message.warning(t('pages.office.tasks.taskStarted'))
    return
  }

  try {
    await wizardStore.executeTask(task.id, {
      mode: task.mode === 'session' ? 'session' : 'run',
    })
    message.success(t('pages.office.tasks.executeSuccess'))
  } catch (error) {
    message.error(t('pages.office.tasks.executeFailed'))
  }
}

async function handleRetryTask(task: WizardTask) {
  try {
    task.status = 'pending'
    task.sessionKey = undefined
    task.startedAt = undefined
    task.completedAt = undefined
    task.conversationHistory = []
    task.executionHistory = []
    
    await wizardStore.saveScenario(selectedTeam.value!)
    
    await wizardStore.executeTask(task.id, {
      mode: task.mode === 'session' ? 'session' : 'run',
    })
    message.success(t('pages.office.tasks.executeSuccess'))
  } catch (error) {
    message.error(t('pages.office.tasks.executeFailed'))
  }
}

async function handleCompleteTask(task: WizardTask) {
  try {
    await wizardStore.updateTaskStatus(task.id, 'completed')
    message.success(t('pages.office.teamTaskPanel.completeSuccess'))
  } catch (error) {
    message.error(t('common.saveFailed'))
  }
}

function handleOpenDeleteTask(task: WizardTask) {
  taskToDelete.value = task
  showDeleteTaskModal.value = true
}

async function handleConfirmDeleteTask() {
  if (!taskToDelete.value) return

  try {
    await wizardStore.deleteTask(taskToDelete.value.id)
    message.success(t('common.delete'))
    showDeleteTaskModal.value = false
    taskToDelete.value = null
  } catch (error) {
    message.error(t('common.delete'))
  }
}

function handleViewTaskDetail(task: WizardTask) {
  emit('view-task', task)
}

async function handleRefresh() {
  await wizardStore.loadScenarios()
  await wizardStore.loadTasks()
  await agentStore.fetchAgents()
  message.success(t('common.refreshSuccess'))
}

function getAgentName(agentId: string): string {
  const agent = agentStore.agents.find((a) => a.id === agentId)
  return agent?.name || agentId
}

function getAgentEmoji(agentId: string): string {
  const agent = agentStore.agents.find((a) => a.id === agentId)
  return agent?.identity?.emoji || '🤖'
}

function handleAgentClick(agentId: string) {
  emit('open-session', agentId)
}

function getExistingBindingsForAgent(agentId: string): AgentBinding[] {
  const config = configStore.config
  console.log('[ScenarioManagementPanel] getExistingBindingsForAgent', agentId, 'config:', config?.bindings)
  if (!config?.bindings) return []
  
  const bindings: AgentBinding[] = []
  for (const binding of config.bindings) {
    if (binding.agentId === agentId && binding.match) {
      bindings.push({
        agentId,
        accountId: binding.match.accountId || agentId,
        channel: binding.match.channel,
        peerId: binding.match.peer?.id || '',
        peerKind: (binding.match.peer?.kind as 'direct' | 'group' | 'channel' | 'dm' | 'acp') || 'group',
      })
    }
  }
  console.log('[ScenarioManagementPanel] found bindings for', agentId, ':', bindings)
  return bindings
}

function handleAddEditTeamBinding() {
  const agentId = String(editTeamMemberOptions.value[0]?.value || '')
  editTeamForm.value.bindings.push({
    agentId,
    accountId: agentId,
    channel: 'feishu',
    peerId: '',
    peerKind: 'group',
  })
}

function handleRemoveEditTeamBinding(index: number) {
  editTeamForm.value.bindings.splice(index, 1)
}

function handleOpenAddBinding() {
  newBindingForm.value = {
    agentId: '',
    channel: '',
    peerId: '',
    peerKind: 'group',
  }
  bindingIndexToEdit.value = -1
  showEditBindingModal.value = true
}

function handleOpenEditBinding(binding: AgentBinding, index: number) {
  newBindingForm.value = {
    agentId: binding.agentId,
    channel: binding.channel,
    peerId: binding.peerId || '',
    peerKind: binding.peerKind || 'group',
  }
  bindingToEdit.value = binding
  bindingIndexToEdit.value = index
  showEditBindingModal.value = true
}

function getMemberBinding(agentId: string): AgentBinding | undefined {
  if (!selectedTeam.value) return undefined
  return selectedTeam.value.bindings.find(b => b.agentId === agentId)
}

function handleOpenEditBindingForMember(agentId: string) {
  if (!selectedTeam.value) return
  
  const existingBinding = getMemberBinding(agentId)
  if (existingBinding) {
    const index = selectedTeam.value.bindings.indexOf(existingBinding)
    handleOpenEditBinding(existingBinding, index)
  } else {
    newBindingForm.value = {
      agentId,
      channel: '',
      peerId: '',
      peerKind: 'group',
    }
    bindingToEdit.value = null
    bindingIndexToEdit.value = -1
    showEditBindingModal.value = true
  }
}

async function handleSaveBinding() {
  if (!selectedTeam.value) return
  if (!newBindingForm.value.agentId || !newBindingForm.value.channel) {
    message.warning(t('pages.office.wizard.taskTitleRequired'))
    return
  }

  try {
    const newBinding: AgentBinding = {
      agentId: newBindingForm.value.agentId,
      channel: newBindingForm.value.channel,
      peerId: newBindingForm.value.peerId || undefined,
      peerKind: newBindingForm.value.peerKind,
    }

    if (bindingIndexToEdit.value >= 0) {
      selectedTeam.value.bindings[bindingIndexToEdit.value] = newBinding
    } else {
      selectedTeam.value.bindings.push(newBinding)
    }

    await wizardStore.saveScenario(selectedTeam.value)
    message.success(t('common.save'))
    showEditBindingModal.value = false
    bindingToEdit.value = null
    bindingIndexToEdit.value = -1
  } catch (error) {
    message.error(t('common.saveFailed'))
  }
}

async function handleDeleteBinding(index: number) {
  if (!selectedTeam.value) return

  try {
    selectedTeam.value.bindings.splice(index, 1)
    await wizardStore.saveScenario(selectedTeam.value)
    message.success(t('common.delete'))
  } catch (error) {
    message.error(t('common.delete'))
  }
}

async function updateTeamConfig(scenario: WizardScenario) {
  const members = getTeamMembers(scenario)
  const allAgentIds = members.map(m => m.id)

  if (allAgentIds.length < 2) {
    return
  }

  try {
    await configStore.fetchConfig()
    const currentConfig = configStore.config || {}

    const existingBindings = currentConfig.bindings || []
    const updatedBindings = [...existingBindings]

    for (const binding of scenario.bindings) {
      const existingIndex = updatedBindings.findIndex(
        (b) => b.agentId === binding.agentId
      )

      const newBinding = {
        match: {
          channel: binding.channel,
          accountId: binding.accountId || binding.agentId,
          peer: binding.peerId ? {
            kind: binding.peerKind || 'group',
            id: binding.peerId,
          } : undefined,
        },
        agentId: binding.agentId,
      }

      if (existingIndex >= 0) {
        updatedBindings[existingIndex] = newBinding
      } else {
        updatedBindings.push(newBinding)
      }
    }

    const currentAllow = currentConfig.tools?.agentToAgent?.allow || []
    const updatedAllow = new Set(currentAllow)
    
    if (!updatedAllow.has('main')) {
      updatedAllow.add('main')
    }
    
    for (const agentId of allAgentIds) {
      if (!updatedAllow.has(agentId)) {
        updatedAllow.add(agentId)
      }
    }

    const updatedConfig = {
      ...currentConfig,
      tools: {
        ...currentConfig.tools,
        sessions: {
          visibility: 'all',
        },
        agentToAgent: {
          enabled: true,
          allow: Array.from(updatedAllow),
        },
      },
      bindings: updatedBindings,
    }

    await configStore.setConfig(updatedConfig)
    console.log('[TeamConfig] Updated config with agentToAgent and bindings for team:', scenario.name, 'agents:', Array.from(updatedAllow))
  } catch (error) {
    console.error('[TeamConfig] Failed to update config:', error)
    throw error
  }
}
</script>

<template>
  <div class="team-task-panel">
    <div class="panel-header">
      <NText strong style="font-size: 16px;">{{ t('pages.office.teamTaskPanel.title') }}</NText>
      <NButton size="small" quaternary @click="handleRefresh">
        <template #icon><NIcon :component="RefreshOutline" /></template>
      </NButton>
    </div>

    <div class="panel-content">
      <div class="team-list-section">
        <div class="section-header">
          <NText depth="2" style="font-size: 13px;">{{ t('pages.office.teamTaskPanel.teamList') }}</NText>
        </div>

        <div class="team-list">
          <div v-if="scenarios.length === 0" class="empty-state">
            <NEmpty :description="t('pages.office.teamManagement.noTeams')" size="small" />
          </div>

          <div
            v-for="scenario in scenarios"
            :key="scenario.id"
            :class="['team-card', { active: selectedTeamId === scenario.id }]"
            @click="handleSelectTeam(scenario.id)"
          >
            <div class="team-card-header">
              <div class="team-name">
                <NIcon :component="PeopleOutline" size="14" />
                <NText strong style="font-size: 13px;">{{ scenario.name }}</NText>
              </div>
              <NTag :type="getStatusColor(scenario.status)" size="small" :bordered="false" round>
                {{ getStatusText(scenario.status) }}
              </NTag>
            </div>

            <NText v-if="scenario.description" depth="3" class="team-description">
              {{ scenario.description }}
            </NText>

            <div class="team-stats">
              <div class="stat-item">
                <NIcon :component="PeopleOutline" size="12" />
                <span>{{ getTeamMembers(scenario).length }}</span>
              </div>
              <div class="stat-item">
                <NIcon :component="ListOutline" size="12" />
                <span>{{ getTeamTaskCount(scenario.id) }}</span>
              </div>
              <div class="stat-item">
                <NIcon :component="TimeOutline" size="12" />
                <span>{{ formatRelativeTime(scenario.updatedAt) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="task-list-section">
        <template v-if="selectedTeam">
          <div class="section-header">
            <NText depth="2" style="font-size: 13px;">{{ t('pages.office.teamTaskPanel.taskList') }}</NText>
            <NSpace :size="8">
              <NButton size="tiny" @click="handleOpenEditTeam">
                {{ t('pages.office.teamTaskPanel.editTeam') }}
              </NButton>
              <NButton size="tiny" @click="handleOpenTeamDetail">
                {{ t('pages.office.teamManagement.viewDetail') }}
              </NButton>
              <NButton size="tiny" type="primary" @click="handleOpenCreateTask">
                <template #icon><NIcon :component="AddOutline" /></template>
                {{ t('pages.office.teamTaskPanel.createTask') }}
              </NButton>
            </NSpace>
          </div>

          <div class="task-stats-bar">
            <NGrid :cols="4" :x-gap="12">
              <NGi>
                <NStatistic :label="t('pages.office.teamTaskPanel.totalTasks')" :value="taskStats.total" />
              </NGi>
              <NGi>
                <NStatistic :label="t('pages.office.teamTaskPanel.pendingTasks')" :value="taskStats.pending" />
              </NGi>
              <NGi>
                <NStatistic :label="t('pages.office.teamTaskPanel.inProgressTasks')" :value="taskStats.inProgress" />
              </NGi>
              <NGi>
                <NStatistic :label="t('pages.office.teamTaskPanel.completedTasks')" :value="taskStats.completed" />
              </NGi>
            </NGrid>
          </div>

          <div class="task-list">
            <div v-if="teamTasks.length === 0" class="empty-state">
              <NEmpty :description="t('pages.office.teamTaskPanel.noTasks')" size="small" />
            </div>

            <div v-for="task in teamTasks" :key="task.id" class="task-card">
              <div class="task-card-header">
                <div class="task-title-row">
                  <NText
                    strong
                    style="font-size: 13px; cursor: pointer;"
                    class="task-title-clickable"
                    @click="handleViewTaskDetail(task)"
                  >
                    {{ task.title }}
                  </NText>
                  <NSpace :size="4">
                    <NTag :type="getTaskStatusColor(task.status)" size="small" :bordered="false" round>
                      {{ getTaskStatusText(task.status) }}
                    </NTag>
                    <NTag :type="getPriorityColor(task.priority)" size="small" :bordered="false" round>
                      {{ getPriorityText(task.priority) }}
                    </NTag>
                    <NTag size="small" :bordered="false" round>
                      {{ getModeText(task.mode) }}
                    </NTag>
                  </NSpace>
                </div>
              </div>

              <NText v-if="task.description" depth="3" class="task-description">
                {{ task.description }}
              </NText>

              <div class="task-meta">
                <div class="meta-item">
                  <NIcon :component="TimeOutline" size="12" />
                  <span>{{ t('pages.office.teamTaskPanel.startTime') }}: {{ formatRelativeTime(task.createdAt) }}</span>
                </div>
                <div v-if="task.completedAt" class="meta-item">
                  <NIcon :component="TimeOutline" size="12" />
                  <span>{{ t('pages.office.teamTaskPanel.endTime') }}: {{ formatRelativeTime(task.completedAt) }}</span>
                </div>
              </div>

              <div v-if="task.assignedAgents.length > 0" class="task-agents">
                <NText depth="3" style="font-size: 11px;">{{ t('pages.office.teamTaskPanel.teamAllAgents') }}:</NText>
                <div class="agent-avatars">
                  <NTooltip v-for="member in getTeamMembers(selectedTeam)" :key="member.id">
                    <template #trigger>
                      <div
                        class="agent-avatar"
                        :class="{ 'clickable': member.exists }"
                        :title="member.name"
                        @click.stop="member.exists && handleAgentClick(member.id)"
                      >
                        <span class="agent-emoji">{{ member.emoji }}</span>
                      </div>
                    </template>
                    {{ member.name }}{{ member.exists ? ` - ${t('pages.office.teamTaskPanel.clickToChat')}` : '' }}
                  </NTooltip>
                </div>
              </div>
              
              <div v-if="task.assignedAgents.length > 0" class="task-assigned">
                <NText depth="3" style="font-size: 11px;">{{ t('pages.office.teamTaskPanel.assignedAgents') }}:</NText>
                <div class="agent-avatars">
                  <NTooltip v-for="agentId in task.assignedAgents" :key="agentId">
                    <template #trigger>
                      <div
                        class="agent-avatar clickable"
                        :title="getAgentName(agentId)"
                        @click.stop="handleAgentClick(agentId)"
                      >
                        <span class="agent-emoji">{{ getAgentEmoji(agentId) }}</span>
                      </div>
                    </template>
                    {{ getAgentName(agentId) }} - {{ t('pages.office.teamTaskPanel.clickToChat') }}
                  </NTooltip>
                </div>
              </div>

              <div class="task-actions">
                <NButton 
                  size="tiny" 
                  secondary 
                  :disabled="task.status === 'completed'"
                  @click="handleOpenEditTask(task)"
                >
                  <template #icon><NIcon :component="CreateOutline" /></template>
                  {{ t('common.edit') }}
                </NButton>
                <NButton
                  v-if="task.status === 'pending'"
                  size="tiny"
                  type="primary"
                  secondary
                  @click="handleExecuteTask(task)"
                >
                  <template #icon><NIcon :component="PlayOutline" /></template>
                  {{ t('pages.office.teamTaskPanel.execute') }}
                </NButton>
                <NButton
                  v-if="task.status === 'in_progress'"
                  size="tiny"
                  type="success"
                  secondary
                  @click="handleCompleteTask(task)"
                >
                  <template #icon><NIcon :component="CheckmarkOutline" /></template>
                  {{ t('pages.office.teamTaskPanel.complete') }}
                </NButton>
                <NButton
                  v-if="task.status !== 'pending'"
                  size="tiny"
                  type="warning"
                  secondary
                  :disabled="task.status === 'completed'"
                  @click="handleRetryTask(task)"
                >
                  <template #icon><NIcon :component="RefreshOutline" /></template>
                  {{ t('common.retry') }}
                </NButton>
                <NButton size="tiny" type="error" secondary @click="handleOpenDeleteTask(task)">
                  <template #icon><NIcon :component="TrashOutline" /></template>
                  {{ t('common.delete') }}
                </NButton>
              </div>
            </div>
          </div>

          <div class="team-actions-bar">
            <NButton size="small" type="error" @click="handleOpenDeleteTeam">
              <template #icon><NIcon :component="TrashOutline" /></template>
              {{ t('pages.office.teamManagement.deleteTeam') }}
            </NButton>
          </div>
        </template>

        <template v-else>
          <div class="empty-state full-height">
            <NEmpty :description="t('pages.office.teamTaskPanel.noTeamSelected')" size="small" />
          </div>
        </template>
      </div>
    </div>
  </div>

  <NModal
    v-model:show="showEditTeamModal"
    preset="card"
    :title="t('pages.office.teamTaskPanel.editTeam')"
    style="width: 500px; max-width: 90vw;"
    :mask-closable="true"
  >
    <NForm label-placement="left" label-width="80">
      <NFormItem :label="t('pages.office.teamTaskPanel.teamName')">
        <NInput
          v-model:value="editTeamForm.name"
          :placeholder="t('pages.office.wizard.scenarioNamePlaceholder')"
        />
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.teamDescription')">
        <NInput
          v-model:value="editTeamForm.description"
          type="textarea"
          :placeholder="t('pages.office.wizard.scenarioDescriptionPlaceholder')"
          :rows="3"
        />
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.teamMembers')">
        <NSelect
          v-model:value="editTeamForm.selectedMembers"
          multiple
          :options="agentOptions"
          :placeholder="t('pages.office.teamTaskPanel.selectMembers')"
        />
      </NFormItem>

      <NDivider style="margin: 12px 0;">{{ t('pages.office.teamTaskPanel.channelBindings') }}</NDivider>

      <div class="bindings-section">
        <NButton size="small" @click="handleAddEditTeamBinding" style="margin-bottom: 12px;">
          <template #icon><NIcon :component="AddOutline" /></template>
          {{ t('pages.office.teamTaskPanel.addBinding') }}
        </NButton>

        <div v-if="editTeamForm.bindings.length > 0" class="bindings-list">
          <div v-for="(binding, index) in editTeamForm.bindings" :key="index" class="binding-item">
            <NSelect
              v-model:value="binding.agentId"
              :options="editTeamMemberOptions"
              style="width: 140px;"
              :placeholder="t('pages.office.wizard.selectAgent')"
            />
            <NSelect
              v-model:value="binding.channel"
              :options="[
                { label: 'Feishu', value: 'feishu' },
                { label: 'WhatsApp', value: 'whatsapp' },
                { label: 'Telegram', value: 'telegram' },
                { label: 'Discord', value: 'discord' },
                { label: 'Slack', value: 'slack' },
              ]"
              style="width: 100px;"
              :placeholder="t('pages.office.wizard.selectChannel')"
            />
            <NInput
              v-model:value="binding.peerId"
              :placeholder="t('pages.office.wizard.peerIdPlaceholder')"
              style="flex: 1;"
            />
            <NSelect
              v-model:value="binding.peerKind"
              :options="[
                { label: 'Group', value: 'group' },
                { label: 'Direct', value: 'direct' },
                { label: 'Channel', value: 'channel' },
                { label: 'DM', value: 'dm' },
                { label: 'ACP', value: 'acp' },
              ]"
              style="width: 80px;"
            />
            <NButton size="small" quaternary type="error" @click="handleRemoveEditTeamBinding(index)">
              <template #icon><NIcon :component="TrashOutline" /></template>
            </NButton>
          </div>
        </div>
        <NText v-else depth="3" style="font-size: 12px;">{{ t('pages.office.teamTaskPanel.noBindings') }}</NText>
      </div>
    </NForm>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="showEditTeamModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="handleEditTeam">{{ t('common.save') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showTeamDetailModal"
    preset="card"
    :title="selectedTeam?.name || ''"
    style="width: 700px; max-width: 90vw;"
    :mask-closable="true"
  >
    <template v-if="selectedTeam">
      <NDescriptions label-placement="left" :column="1" bordered size="small">
        <NDescriptionsItem :label="t('pages.office.teamManagement.detail.status')">
          <NTag :type="getStatusColor(selectedTeam.status)" size="small" :bordered="false" round>
            {{ getStatusText(selectedTeam.status) }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.office.teamManagement.detail.description')">
          {{ selectedTeam.description || '-' }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.office.teamManagement.detail.createdAt')">
          {{ formatRelativeTime(selectedTeam.createdAt) }}
        </NDescriptionsItem>
      </NDescriptions>

      <NDivider style="margin: 16px 0;">{{ t('pages.office.teamManagement.detail.agents') }}</NDivider>

      <div class="detail-section">
        <div v-if="getTeamMembers(selectedTeam).length === 0" class="empty-section">
          <NText depth="3">{{ t('pages.office.teamManagement.detail.noAgents') }}</NText>
        </div>
        <div v-else class="member-grid">
          <div
            v-for="member in getTeamMembers(selectedTeam)"
            :key="member.id"
            class="member-card"
          >
            <div class="member-avatar">
              <span class="member-emoji">{{ member.emoji || '🤖' }}</span>
            </div>
            <div class="member-info">
              <NText strong style="font-size: 12px;">{{ member.name }}</NText>
              <NText depth="3" style="font-size: 10px;">{{ member.role }}</NText>
            </div>
            <NTag :type="member.exists ? 'success' : 'default'" size="tiny" :bordered="false" round>
              {{ member.exists ? t('pages.office.teamManagement.agentExists') : t('pages.office.teamManagement.agentNotExists') }}
            </NTag>
          </div>
        </div>
      </div>

      <NDivider style="margin: 16px 0;">{{ t('pages.office.teamTaskPanel.channelBindings') }}</NDivider>

      <div class="detail-section">
        <div class="member-grid">
          <div
            v-for="member in getTeamMembers(selectedTeam)"
            :key="member.id"
            class="member-card"
          >
            <div class="member-avatar">
              <span class="member-emoji">{{ member.emoji || '🤖' }}</span>
            </div>
            <div class="member-info">
              <NText strong style="font-size: 12px;">{{ member.name }}</NText>
              <template v-if="getMemberBinding(member.id)">
                <NTag size="tiny" :bordered="false" round>
                  {{ getMemberBinding(member.id)?.channel }}
                </NTag>
                <NText v-if="getMemberBinding(member.id)?.peerId" depth="3" style="font-size: 10px;">
                  {{ getMemberBinding(member.id)?.peerId }}
                </NText>
              </template>
              <NText v-else depth="3" style="font-size: 10px;">{{ t('pages.office.teamTaskPanel.noBindings') }}</NText>
            </div>
            <NTag v-if="!member.exists" type="warning" size="tiny" :bordered="false" round>
              {{ t('pages.office.teamManagement.agentNotExists') }}
            </NTag>
          </div>
        </div>
      </div>
    </template>
  </NModal>

  <NModal
    v-model:show="showEditBindingModal"
    preset="card"
    :title="bindingIndexToEdit >= 0 ? t('pages.office.teamTaskPanel.editBinding') : t('pages.office.teamTaskPanel.addBinding')"
    style="width: 450px; max-width: 90vw;"
    :mask-closable="true"
  >
    <NForm label-placement="left" label-width="100">
      <NFormItem :label="t('pages.office.teamTaskPanel.bindingAgent')">
        <NSelect
          v-model:value="newBindingForm.agentId"
          :options="teamMemberOptions"
          :placeholder="t('pages.office.teamTaskPanel.selectMembers')"
        />
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.bindingChannel')">
        <NInput
          v-model:value="newBindingForm.channel"
          placeholder="e.g. qqbot, feishu, telegram"
        />
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.bindingPeerId')">
        <NInput
          v-model:value="newBindingForm.peerId"
          placeholder="Peer ID (optional)"
        />
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.bindingPeerKind')">
        <NRadioGroup v-model:value="newBindingForm.peerKind">
          <NSpace>
            <NRadio value="user">User</NRadio>
            <NRadio value="group">Group</NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>
    </NForm>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="showEditBindingModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="handleSaveBinding">{{ t('common.save') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showDeleteTeamModal"
    preset="card"
    :title="t('pages.office.teamManagement.deleteTeam')"
    style="width: 500px; max-width: 90vw;"
    :mask-closable="false"
    :closable="!isDeleting"
  >
    <template v-if="selectedTeam">
      <NText style="margin-bottom: 16px; display: block;">
        {{ t('pages.office.teamManagement.deleteConfirm', { name: selectedTeam.name }) }}
      </NText>

      <template v-if="isDeleting">
        <NCard size="small" :bordered="false" style="background: var(--n-color);">
          <NSpace vertical :size="12">
            <NSpace align="center" :size="8">
              <NSpin size="small" />
              <NText strong>{{ t('pages.office.teamTaskPanel.deleting') }}</NText>
            </NSpace>
            
            <NProgress
              type="line"
              :percentage="deleteProgress.total > 0 ? Math.round((deleteProgress.current / deleteProgress.total) * 100) : 0"
              :show-indicator="true"
              :height="12"
              :border-radius="4"
            />
            
            <NGrid :cols="3" :x-gap="12">
              <NGi>
                <NStatistic :label="t('pages.office.teamTaskPanel.totalAgents')" :value="deleteProgress.total" />
              </NGi>
              <NGi>
                <NStatistic :label="t('pages.office.teamTaskPanel.deletedAgents')" :value="deleteProgress.success">
                  <template #suffix>
                    <NText type="success" style="font-size: 14px;">✓</NText>
                  </template>
                </NStatistic>
              </NGi>
              <NGi>
                <NStatistic :label="t('pages.office.teamTaskPanel.failedAgents')" :value="deleteProgress.failed">
                  <template #suffix>
                    <NText v-if="deleteProgress.failed > 0" type="error" style="font-size: 14px;">✗</NText>
                  </template>
                </NStatistic>
              </NGi>
            </NGrid>
            
            <NText v-if="deleteProgress.currentAgentName" depth="3" style="font-size: 12px;">
              {{ t('pages.office.teamTaskPanel.currentlyDeleting') }}: {{ deleteProgress.currentAgentName }}
            </NText>
          </NSpace>
        </NCard>
      </template>
      
      <template v-else>
        <NText depth="3" style="font-size: 12px; margin-bottom: 8px; display: block;">
          {{ t('pages.office.teamTaskPanel.deleteAgentLabel') }}
        </NText>
        <NRadioGroup v-model:value="deleteAgentOption">
          <NSpace vertical>
            <NRadio value="team_only">{{ t('pages.office.teamTaskPanel.deleteTeamOnly') }}</NRadio>
            <NRadio value="all">{{ t('pages.office.teamTaskPanel.deleteTeamAll') }}</NRadio>
          </NSpace>
        </NRadioGroup>
      </template>
    </template>

    <template #footer>
      <NSpace justify="end">
        <NButton :disabled="isDeleting" @click="showDeleteTeamModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="error" :loading="isDeleting" :disabled="isDeleting" @click="handleConfirmDeleteTeam">{{ t('common.confirm') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showCreateTaskModal"
    preset="card"
    :title="t('pages.office.teamTaskPanel.createTask')"
    style="width: 500px; max-width: 90vw;"
    :mask-closable="true"
  >
    <NForm label-placement="left" label-width="80">
      <NFormItem :label="t('pages.office.teamTaskPanel.taskTitle')">
        <NInput
          v-model:value="newTaskForm.title"
          :placeholder="t('pages.office.wizard.taskTitlePlaceholder')"
        />
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.taskDescription')">
        <NInput
          v-model:value="newTaskForm.description"
          type="textarea"
          :placeholder="t('pages.office.wizard.taskDescriptionPlaceholder')"
          :rows="3"
        />
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.taskPriority')">
        <NRadioGroup v-model:value="newTaskForm.priority">
          <NSpace>
            <NRadio value="low">{{ t('pages.office.tasks.priority.low') }}</NRadio>
            <NRadio value="medium">{{ t('pages.office.tasks.priority.medium') }}</NRadio>
            <NRadio value="high">{{ t('pages.office.tasks.priority.high') }}</NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.taskMode')">
        <NRadioGroup v-model:value="newTaskForm.mode">
          <NSpace>
            <NRadio value="run">{{ t('pages.office.teamTaskPanel.modeRun') }}</NRadio>
            <NRadio value="session">{{ t('pages.office.teamTaskPanel.modeSession') }}</NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.assignAgents')">
        <NSelect
          v-model:value="newTaskForm.assignedAgents"
          multiple
          :options="teamMemberOptions"
          :placeholder="t('pages.office.teamTaskPanel.selectMembers')"
        />
      </NFormItem>
    </NForm>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="showCreateTaskModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="handleCreateTask">{{ t('common.create') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showEditTaskModal"
    preset="card"
    :title="t('pages.office.teamTaskPanel.editTask')"
    style="width: 500px; max-width: 90vw;"
    :mask-closable="true"
  >
    <NForm label-placement="left" label-width="80">
      <NFormItem :label="t('pages.office.teamTaskPanel.taskTitle')">
        <NInput
          v-model:value="newTaskForm.title"
          :placeholder="t('pages.office.wizard.taskTitlePlaceholder')"
        />
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.taskDescription')">
        <NInput
          v-model:value="newTaskForm.description"
          type="textarea"
          :placeholder="t('pages.office.wizard.taskDescriptionPlaceholder')"
          :rows="3"
        />
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.taskPriority')">
        <NRadioGroup v-model:value="newTaskForm.priority">
          <NSpace>
            <NRadio value="low">{{ t('pages.office.tasks.priority.low') }}</NRadio>
            <NRadio value="medium">{{ t('pages.office.tasks.priority.medium') }}</NRadio>
            <NRadio value="high">{{ t('pages.office.tasks.priority.high') }}</NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.taskMode')">
        <NRadioGroup v-model:value="newTaskForm.mode">
          <NSpace>
            <NRadio value="run">{{ t('pages.office.teamTaskPanel.modeRun') }}</NRadio>
            <NRadio value="session">{{ t('pages.office.teamTaskPanel.modeSession') }}</NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>
      <NFormItem :label="t('pages.office.teamTaskPanel.assignAgents')">
        <NSelect
          v-model:value="newTaskForm.assignedAgents"
          multiple
          :options="teamMemberOptions"
          :placeholder="t('pages.office.teamTaskPanel.selectMembers')"
        />
      </NFormItem>
    </NForm>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="showEditTaskModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="handleEditTask">{{ t('common.save') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showDeleteTaskModal"
    preset="card"
    :title="t('common.delete')"
    style="width: 400px; max-width: 90vw;"
    :mask-closable="false"
  >
    <NText>
      {{ t('common.confirm') }} {{ t('common.delete') }} "{{ taskToDelete?.title }}"?
    </NText>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="showDeleteTaskModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="error" @click="handleConfirmDeleteTask">{{ t('common.confirm') }}</NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped>
.team-task-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.team-list-section {
  width: 40%;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.task-list-section {
  width: 60%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.team-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  max-height: 400px;
}

.team-card {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.team-card:hover {
  border-color: var(--primary-color);
}

.team-card.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px var(--primary-color);
}

.team-card:last-child {
  margin-bottom: 0;
}

.team-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.team-name {
  display: flex;
  align-items: center;
  gap: 6px;
}

.team-description {
  font-size: 11px;
  margin-top: 4px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-stats {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.task-stats-bar {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  max-height: 350px;
}

.task-card {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.task-card:last-child {
  margin-bottom: 0;
}

.task-card-header {
  margin-bottom: 4px;
}

.task-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.task-title-clickable:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

.task-description {
  font-size: 11px;
  margin-top: 4px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.task-agents {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.task-assigned {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.agent-avatars {
  display: flex;
  gap: 4px;
}

.agent-avatar {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border-radius: 50%;
}

.agent-avatar.clickable {
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-avatar.clickable:hover {
  background: var(--primary-color);
  transform: scale(1.1);
}

.agent-emoji {
  font-size: 12px;
}

.task-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.team-actions-bar {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.empty-state.full-height {
  flex: 1;
}

.detail-section {
  min-height: 60px;
}

.empty-section {
  padding: 16px;
  text-align: center;
}

.member-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.member-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.member-avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border-radius: 50%;
}

.member-emoji {
  font-size: 16px;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.bindings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.bindings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.binding-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.binding-card:hover {
  border-color: var(--primary-color);
}

.binding-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.binding-agent {
  display: flex;
  align-items: center;
  gap: 8px;
}

.binding-detail {
  display: flex;
  align-items: center;
  gap: 8px;
}

.binding-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.binding-card:hover .binding-actions {
  opacity: 1;
}

.ai-created-agents {
  margin-top: 12px;
}

.created-agent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.created-agent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.created-agent-item .agent-info {
  flex: 1;
}

.agent-name-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.bindings-section {
  margin-top: 8px;
}

.binding-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  margin-bottom: 8px;
}

.binding-item:last-child {
  margin-bottom: 0;
}
</style>
