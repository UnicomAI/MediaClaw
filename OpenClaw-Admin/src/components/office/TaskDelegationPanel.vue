<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NCard,
  NButton,
  NSpace,
  NText,
  NTag,
  NIcon,
  NEmpty,
  NTooltip,
  NModal,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NScrollbar,
  NPopconfirm,
  NSpin,
  useMessage,
} from 'naive-ui'
import {
  PlayOutline,
  TrashOutline,
  RefreshOutline,
  TimeOutline,
  EyeOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline,
  PersonOutline,
  PulseOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useWizardStore, type WizardTask, type TaskConversation } from '@/stores/wizard'
import { useAgentStore } from '@/stores/agent'
import { useWebSocketStore } from '@/stores/websocket'
import { formatRelativeTime } from '@/utils/format'

const { t } = useI18n()
const message = useMessage()
const wizardStore = useWizardStore()
const agentStore = useAgentStore()
const wsStore = useWebSocketStore()

const tasks = computed(() => wizardStore.tasks)
const showDetailModal = ref(false)
const selectedTask = ref<WizardTask | null>(null)
const executingTasks = ref<Set<string>>(new Set())
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    await agentStore.fetchAgents()
    await wizardStore.initialize()
  } finally {
    loading.value = false
  }
})

function getStatusColor(status: string) {
  switch (status) {
    case 'pending': return 'default'
    case 'in_progress': return 'info'
    case 'completed': return 'success'
    case 'failed': return 'error'
    default: return 'default'
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'pending': return t('pages.office.tasks.status.pending')
    case 'in_progress': return t('pages.office.tasks.status.inProgress')
    case 'completed': return t('pages.office.tasks.status.completed')
    case 'failed': return t('pages.office.tasks.status.failed')
    default: return status
  }
}

function getPriorityType(priority: string): 'default' | 'info' | 'warning' | 'error' {
  switch (priority) {
    case 'high': return 'error'
    case 'medium': return 'warning'
    case 'low': return 'default'
    default: return 'default'
  }
}

function getPriorityText(priority: string) {
  switch (priority) {
    case 'high': return t('pages.office.tasks.priority.high')
    case 'medium': return t('pages.office.tasks.priority.medium')
    case 'low': return t('pages.office.tasks.priority.low')
    default: return priority
  }
}

function getAgentName(agentId: string): string {
  const agent = agentStore.agents.find(a => a.id === agentId)
  return agent?.name || agentId
}

function getAgentEmoji(agentId: string): string {
  const agent = agentStore.agents.find(a => a.id === agentId)
  return agent?.identity?.emoji || '🤖'
}

function handleViewDetail(task: WizardTask) {
  selectedTask.value = task
  showDetailModal.value = true
}

async function executeWithSessionsSeed(task: WizardTask) {
  const taskMessage = `【任务】${task.title}\n\n${task.description || ''}\n\n请按照以下模式执行：sessions_seed`
  
  for (const agentId of task.assignedAgents) {
    const agent = agentStore.agents.find(a => a.id === agentId)
    if (!agent) {
      console.warn('[TaskManagement] Agent not found:', agentId)
      continue
    }
    
    const sessionKey = `agent:${agentId}:main:dm:task-${task.id}-${Date.now()}`
    
    try {
      const result = await wsStore.rpc.spawnSession({
        agentId,
        channel: 'main',
        peer: `task-${task.id}`,
        label: task.title,
        initialMessage: taskMessage,
      })
      
      console.log('[TaskManagement] Session spawned:', result.sessionKey)
      
      const conversation: TaskConversation = {
        id: `conv-${Date.now()}`,
        taskId: task.id,
        agentId,
        role: 'user',
        content: taskMessage,
        timestamp: Date.now(),
      }
      await wizardStore.addConversationToTask(task.id, conversation)
    } catch (error) {
      console.error('[TaskManagement] Failed to spawn session for agent:', agentId, error)
      throw error
    }
  }
}

async function executeWithRun(task: WizardTask) {
  const taskMessage = `【任务】${task.title}\n\n${task.description || ''}`
  
  for (const agentId of task.assignedAgents) {
    const agent = agentStore.agents.find(a => a.id === agentId)
    if (!agent) {
      console.warn('[TaskManagement] Agent not found:', agentId)
      continue
    }
    
    const sessionKey = `agent:${agentId}:main:dm:task-${task.id}-${Date.now()}`
    
    try {
      const result = await wsStore.rpc.callAgent({
        sessionKey,
        message: taskMessage,
      })
      
      console.log('[TaskManagement] Agent called:', agentId, result)
      
      const conversation: TaskConversation = {
        id: `conv-${Date.now()}`,
        taskId: task.id,
        agentId,
        role: 'user',
        content: taskMessage,
        timestamp: Date.now(),
      }
      await wizardStore.addConversationToTask(task.id, conversation)
      
      if (result && typeof result === 'object') {
        const resultObj = result as Record<string, unknown>
        const responseConversation: TaskConversation = {
          id: `conv-${Date.now()}-response`,
          taskId: task.id,
          agentId,
          role: 'assistant',
          content: String(resultObj.output || resultObj.response || resultObj.result || JSON.stringify(result)),
          timestamp: Date.now(),
        }
        await wizardStore.addConversationToTask(task.id, responseConversation)
      }
    } catch (error) {
      console.error('[TaskManagement] Failed to call agent:', agentId, error)
      throw error
    }
  }
}

async function handleExecuteTask(task: WizardTask) {
  if (executingTasks.value.has(task.id)) return
  
  if (task.assignedAgents.length === 0) {
    message.warning(t('pages.office.tasks.noAssignedAgents'))
    return
  }
  
  executingTasks.value.add(task.id)
  task.status = 'in_progress'
  await wizardStore.saveTask(task)
  
  try {
    switch (task.mode) {
      case 'sessions_seed':
        await executeWithSessionsSeed(task)
        break
      case 'run':
      default:
        await executeWithRun(task)
        break
    }
    
    task.status = 'completed'
    await wizardStore.saveTask(task)
    message.success(t('pages.office.tasks.executeSuccess'))
  } catch (error) {
    console.error('[TaskManagement] Task execution failed:', error)
    task.status = 'failed'
    await wizardStore.saveTask(task)
    message.error(t('pages.office.tasks.executeFailed'))
  } finally {
    executingTasks.value.delete(task.id)
  }
}

async function handleDeleteTask(taskId: string) {
  try {
    await wizardStore.deleteTask(taskId)
    message.success(t('common.deleteSuccess'))
    if (selectedTask.value?.id === taskId) {
      showDetailModal.value = false
      selectedTask.value = null
    }
  } catch (error) {
    console.error('[TaskManagement] Delete task failed:', error)
    message.error(t('common.deleteFailed'))
  }
}

async function handleRefresh() {
  loading.value = true
  try {
    await wizardStore.loadTasks()
    message.success(t('common.refreshSuccess'))
  } finally {
    loading.value = false
  }
}

function getModeText(mode: string): string {
  switch (mode) {
    case 'sessions_seed': return t('pages.office.tasks.mode.sessionsSeed')
    case 'broadcast': return t('pages.office.tasks.mode.broadcast')
    case 'sequential': return t('pages.office.tasks.mode.sequential')
    case 'run': return t('pages.office.tasks.mode.default')
    default: return mode || t('pages.office.tasks.mode.default')
  }
}

function getRoleText(role: string): string {
  switch (role) {
    case 'user': return t('pages.chat.roles.user')
    case 'assistant': return t('pages.chat.roles.assistant')
    case 'system': return t('pages.chat.roles.system')
    case 'tool': return t('pages.chat.roles.tool')
    default: return role
  }
}
</script>

<template>
  <NCard :title="t('pages.office.tasks.title')" size="small" embedded class="task-panel-card">
    <template #header-extra>
      <NSpace align="center" :size="8">
        <NTag v-if="tasks.length > 0" size="small" :bordered="false" round>
          {{ t('pages.office.tasks.count', { count: tasks.length }) }}
        </NTag>
        <NButton size="tiny" quaternary :loading="loading" @click="handleRefresh">
          <template #icon><NIcon :component="RefreshOutline" /></template>
        </NButton>
      </NSpace>
    </template>

    <NSpin :show="loading">
      <div class="task-panel">
        <div v-if="tasks.length === 0" class="task-empty">
          <NEmpty :description="t('pages.office.tasks.noTasks')" size="small" />
        </div>

        <NScrollbar v-else class="task-list-container">
          <div class="task-list">
            <div
              v-for="task in tasks"
              :key="task.id"
              class="task-item"
              :class="`status-${task.status}`"
            >
              <div class="task-header">
                <div class="task-title-row">
                  <NTooltip>
                    <template #trigger>
                      <NTag :type="getPriorityType(task.priority)" size="tiny" :bordered="false" round>
                        {{ getPriorityText(task.priority) }}
                      </NTag>
                    </template>
                    {{ t('pages.office.tasks.detailLabels.priority') }}
                  </NTooltip>
                  <NText strong class="task-title">{{ task.title }}</NText>
                </div>
                <NTag :type="getStatusColor(task.status)" size="small" :bordered="false" round>
                  {{ getStatusText(task.status) }}
                </NTag>
              </div>

              <NText v-if="task.description" depth="3" class="task-description">
                {{ task.description }}
              </NText>

              <div class="task-meta">
                <div class="task-assignees">
                  <NIcon :component="PersonOutline" size="12" />
                  <div class="assignee-chips">
                    <NTooltip v-for="agentId in task.assignedAgents" :key="agentId">
                      <template #trigger>
                        <NTag size="tiny" :bordered="false" round>
                          {{ getAgentEmoji(agentId) }} {{ getAgentName(agentId) }}
                        </NTag>
                      </template>
                      {{ agentId }}
                    </NTooltip>
                    <span v-if="task.assignedAgents.length === 0" class="unassigned-text">
                      {{ t('pages.office.tasks.unassigned') }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="task-info">
                <div class="info-item">
                  <NIcon :component="PulseOutline" size="10" />
                  <span>{{ getModeText(task.mode) }}</span>
                </div>
                <div class="info-item">
                  <NIcon :component="TimeOutline" size="10" />
                  <span>{{ formatRelativeTime(task.createdAt) }}</span>
                </div>
              </div>

              <div class="task-actions">
                <NButton size="tiny" secondary @click="handleViewDetail(task)">
                  <template #icon><NIcon :component="EyeOutline" /></template>
                  {{ t('common.view') }}
                </NButton>
                <NButton
                  v-if="task.status === 'pending'"
                  size="tiny"
                  type="primary"
                  secondary
                  :loading="executingTasks.has(task.id)"
                  :disabled="task.assignedAgents.length === 0"
                  @click="handleExecuteTask(task)"
                >
                  <template #icon><NIcon :component="PlayOutline" /></template>
                  {{ t('pages.office.tasks.execute') }}
                </NButton>
                <NButton
                  v-if="task.status === 'in_progress'"
                  size="tiny"
                  type="info"
                  secondary
                  :loading="executingTasks.has(task.id)"
                  disabled
                >
                  <template #icon><NIcon :component="PulseOutline" /></template>
                  {{ t('pages.office.tasks.inProgress') }}
                </NButton>
                <NButton
                  v-if="task.status === 'completed'"
                  size="tiny"
                  type="success"
                  secondary
                  disabled
                >
                  <template #icon><NIcon :component="CheckmarkCircleOutline" /></template>
                  {{ t('pages.office.tasks.completed') }}
                </NButton>
                <NButton
                  v-if="task.status === 'failed'"
                  size="tiny"
                  type="error"
                  secondary
                  disabled
                >
                  <template #icon><NIcon :component="CloseCircleOutline" /></template>
                  {{ t('pages.office.tasks.failed') }}
                </NButton>
                <NPopconfirm @positive-click="handleDeleteTask(task.id)">
                  <template #trigger>
                    <NButton size="tiny" secondary type="error">
                      <template #icon><NIcon :component="TrashOutline" /></template>
                    </NButton>
                  </template>
                  {{ t('common.confirm') }}{{ t('common.delete') }}?
                </NPopconfirm>
              </div>
            </div>
          </div>
        </NScrollbar>
      </div>
    </NSpin>
  </NCard>

  <NModal
    v-model:show="showDetailModal"
    preset="card"
    :title="selectedTask?.title || ''"
    style="width: 700px; max-width: 90vw;"
    :mask-closable="true"
  >
    <template v-if="selectedTask">
      <NDescriptions label-placement="left" :column="2" bordered size="small">
        <NDescriptionsItem :label="t('pages.office.tasks.detail.status')">
          <NTag :type="getStatusColor(selectedTask.status)" size="small" :bordered="false" round>
            {{ getStatusText(selectedTask.status) }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.office.tasks.detail.priority')">
          <NTag :type="getPriorityType(selectedTask.priority)" size="small" :bordered="false" round>
            {{ getPriorityText(selectedTask.priority) }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.office.tasks.detail.mode')">
          {{ getModeText(selectedTask.mode) }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.office.tasks.detail.createdAt')">
          {{ formatRelativeTime(selectedTask.createdAt) }}
        </NDescriptionsItem>
        <NDescriptionsItem :label="t('pages.office.tasks.detail.description')" :span="2">
          {{ selectedTask.description || '-' }}
        </NDescriptionsItem>
      </NDescriptions>

      <NDivider style="margin: 16px 0;">{{ t('pages.office.tasks.detail.assignedAgents') }}</NDivider>

      <div class="detail-section">
        <div v-if="selectedTask.assignedAgents.length === 0" class="empty-section">
          <NText depth="3">{{ t('pages.office.tasks.unassigned') }}</NText>
        </div>
        <div v-else class="agent-grid">
          <div
            v-for="agentId in selectedTask.assignedAgents"
            :key="agentId"
            class="agent-card"
          >
            <div class="agent-avatar">
              <span class="agent-emoji">{{ getAgentEmoji(agentId) }}</span>
            </div>
            <div class="agent-info">
              <NText strong class="agent-name">{{ getAgentName(agentId) }}</NText>
              <NText depth="3" class="agent-id">{{ agentId }}</NText>
            </div>
          </div>
        </div>
      </div>

      <template v-if="selectedTask.conversationHistory && selectedTask.conversationHistory.length > 0">
        <NDivider style="margin: 16px 0;">{{ t('pages.office.tasks.detail.conversations') }}</NDivider>
        <NScrollbar class="conversation-scroll">
          <div class="conversation-list">
            <div
              v-for="conv in selectedTask.conversationHistory"
              :key="conv.id"
              class="conversation-item"
              :class="`role-${conv.role}`"
            >
              <div class="conv-header">
                <div class="conv-role">
                  <NTag size="tiny" :type="conv.role === 'user' ? 'info' : conv.role === 'assistant' ? 'success' : 'default'" round>
                    {{ getRoleText(conv.role) }}
                  </NTag>
                  <span v-if="conv.agentId" class="conv-agent">{{ getAgentEmoji(conv.agentId) }} {{ getAgentName(conv.agentId) }}</span>
                </div>
                <NText depth="3" class="conv-time">{{ formatRelativeTime(conv.timestamp) }}</NText>
              </div>
              <div class="conv-content">{{ conv.content }}</div>
            </div>
          </div>
        </NScrollbar>
      </template>

      <div class="detail-actions">
        <NSpace>
          <NButton
            v-if="selectedTask.status === 'pending'"
            type="primary"
            :loading="executingTasks.has(selectedTask.id)"
            :disabled="selectedTask.assignedAgents.length === 0"
            @click="handleExecuteTask(selectedTask); showDetailModal = false"
          >
            <template #icon><NIcon :component="PlayOutline" /></template>
            {{ t('pages.office.tasks.execute') }}
          </NButton>
          <NPopconfirm @positive-click="handleDeleteTask(selectedTask.id)">
            <template #trigger>
              <NButton type="error">
                <template #icon><NIcon :component="TrashOutline" /></template>
                {{ t('common.delete') }}
              </NButton>
            </template>
            {{ t('common.confirm') }}{{ t('common.delete') }}?
          </NPopconfirm>
        </NSpace>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.task-panel-card {
  height: 500px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.task-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.task-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-list-container {
  flex: 1;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

.task-item {
  padding: 10px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  transition: border-color 0.2s ease;
}

.task-item:hover {
  border-color: var(--primary-color);
}

.task-item.status-in_progress {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 5%, var(--bg-secondary));
}

.task-item.status-completed {
  opacity: 0.8;
}

.task-item.status-failed {
  border-color: var(--error-color);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.task-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.task-title {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-description {
  font-size: 11px;
  display: block;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.task-meta {
  margin-top: 8px;
}

.task-assignees {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.assignee-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.unassigned-text {
  color: var(--text-color-disabled);
  font-style: italic;
}

.task-info {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-color-secondary);
}

.task-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.detail-section {
  min-height: 60px;
}

.empty-section {
  padding: 16px;
  text-align: center;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.agent-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.agent-avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border-radius: 50%;
  flex-shrink: 0;
}

.agent-emoji {
  font-size: 16px;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 12px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-id {
  font-size: 10px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-scroll {
  max-height: 300px;
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conversation-item {
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.conversation-item.role-user {
  border-left: 3px solid var(--info-color);
}

.conversation-item.role-assistant {
  border-left: 3px solid var(--success-color);
}

.conversation-item.role-system {
  border-left: 3px solid var(--warning-color);
}

.conv-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.conv-role {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conv-agent {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.conv-time {
  font-size: 10px;
}

.conv-content {
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-actions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}
</style>
