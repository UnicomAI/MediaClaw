<script setup lang="ts">
import { computed } from 'vue'
import {
  NSpace,
  NText,
  NTag,
  NIcon,
  NButton,
  NTooltip,
  NAvatar,
} from 'naive-ui'
import {
  PulseOutline,
  ChatbubbleOutline,
  PlayOutline,
  ChevronDownOutline,
  ChevronUpOutline,
  ChatbubblesOutline,
  PersonOutline,
  AddOutline,
  CreateOutline,
  SettingsOutline,
  ExtensionPuzzleOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useOfficeStore } from '@/stores/office'
import type { OfficeAgent } from '@/stores/office'

const props = defineProps<{
  agent: OfficeAgent
  selected?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', agentId: string): void
  (e: 'createSession', agentId: string): void
  (e: 'delegate', agentId: string): void
  (e: 'identity', agentId: string): void
  (e: 'model', agentId: string): void
  (e: 'tools', agentId: string): void
  (e: 'delete', agentId: string): void
}>()

const { t } = useI18n()
const officeStore = useOfficeStore()

const expanded = computed(() => officeStore.selectedAgentId === props.agent.id)

const isMain = computed(() => props.agent.id === 'main')

const statusColor = computed(() => {
  switch (props.agent.status) {
    case 'working': return '#18a058'
    case 'communicating': return '#2080f0'
    case 'idle': return '#909399'
    case 'offline': return '#d03050'
    default: return '#909399'
  }
})

const statusText = computed(() => {
  switch (props.agent.status) {
    case 'working': return t('pages.office.agentStatus.working')
    case 'communicating': return t('pages.office.agentStatus.communicating')
    case 'idle': return t('pages.office.agentStatus.idle')
    case 'offline': return t('pages.office.agentStatus.offline')
    default: return t('pages.office.agentStatus.idle')
  }
})

const formattedTokens = computed(() => {
  const tokens = props.agent.totalTokens
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return String(tokens)
})

// Check if avatar URL is valid (supports both HTTP URLs and relative paths)
const isValidAvatarUrl = (url: string | undefined) => {
  if (!url) return false
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('avatars/'))
}

function handleSelect() {
  if (expanded.value) {
    officeStore.selectAgent(null)
  } else {
    officeStore.selectAgent(props.agent.id)
  }
  emit('select', props.agent.id)
}

function handleCreateSession() {
  emit('createSession', props.agent.id)
}

function handleDelegate() {
  emit('delegate', props.agent.id)
}

function handleIdentity() {
  emit('identity', props.agent.id)
}

function handleModel() {
  emit('model', props.agent.id)
}

function handleTools() {
  emit('tools', props.agent.id)
}

function handleDelete() {
  emit('delete', props.agent.id)
}
</script>

<template>
  <div class="agent-wrapper" :class="{ 'is-expanded': expanded }">
    <div
      class="agent-character"
      :class="{
        'is-selected': selected,
        'is-compact': compact,
        'is-working': agent.status === 'working',
        'is-communicating': agent.status === 'communicating',
        'is-expanded': expanded,
      }"
      :style="{ '--agent-color': agent.color, '--status-color': statusColor }"
      @click="handleSelect"
    >
      <div class="agent-avatar-container">
        <div class="agent-avatar-ring">
          <div class="agent-avatar">
            <span v-if="agent.emoji" class="agent-emoji">{{ agent.emoji }}</span>
            <img
              v-else-if="isValidAvatarUrl(agent.avatar)"
              :src="agent.avatar"
              class="agent-avatar-image"
              :alt="agent.name"
              @error="(e) => { (e.target as HTMLImageElement).style.display = 'none' }"
            />
            <NAvatar v-else round :style="{ background: agent.color }">
              <NIcon :component="PersonOutline" />
            </NAvatar>
          </div>
        </div>
        <div class="agent-status-indicator" :class="`status-${agent.status}`">
          <span class="status-dot"></span>
        </div>
        <div v-if="agent.status === 'working'" class="agent-activity-ring"></div>
      </div>

      <div class="agent-info">
        <div class="agent-name-row">
          <NText strong class="agent-name">{{ agent.name }}</NText>
          <NTag
            size="tiny"
            :type="agent.status === 'working' ? 'success' : agent.status === 'communicating' ? 'info' : 'default'"
            :bordered="false"
            round
          >
            {{ statusText }}
          </NTag>
        </div>
        <NText depth="3" style="font-size: 11px;">{{ agent.id }}</NText>
      </div>

      <div v-if="!compact" class="agent-stats">
        <div class="agent-stat">
          <NIcon :component="ChatbubblesOutline" size="14" />
          <span>{{ agent.sessionCount }}</span>
          <NText depth="3" style="font-size: 10px;">{{ t('pages.office.sessionsLabel') }}</NText>
        </div>
        <div class="agent-stat">
          <NIcon :component="PulseOutline" size="14" />
          <span>{{ formattedTokens }}</span>
          <NText depth="3" style="font-size: 10px;">tokens</NText>
        </div>
      </div>

      <div v-if="!compact" class="agent-expand-btn">
        <NIcon :component="expanded ? ChevronUpOutline : ChevronDownOutline" />
      </div>

      <div v-if="!compact" class="agent-actions">
        <NTooltip>
          <template #trigger>
            <NButton size="tiny" quaternary circle @click.stop="handleCreateSession">
              <template #icon><NIcon :component="AddOutline" /></template>
            </NButton>
          </template>
          {{ t('pages.office.sessions.newSession') }}
        </NTooltip>
        <NTooltip>
          <template #trigger>
            <NButton size="tiny" quaternary circle @click.stop="handleDelegate">
              <template #icon><NIcon :component="PlayOutline" /></template>
            </NButton>
          </template>
          {{ t('pages.office.delegateTask') }}
        </NTooltip>
        <NTooltip>
          <template #trigger>
            <NButton size="tiny" quaternary circle @click.stop="handleIdentity">
              <template #icon><NIcon :component="CreateOutline" /></template>
            </NButton>
          </template>
          {{ t('pages.agents.actions.identity') }}
        </NTooltip>
        <NTooltip>
          <template #trigger>
            <NButton size="tiny" quaternary circle @click.stop="handleModel">
              <template #icon><NIcon :component="SettingsOutline" /></template>
            </NButton>
          </template>
          {{ t('pages.agents.actions.model') }}
        </NTooltip>
        <NTooltip>
          <template #trigger>
            <NButton size="tiny" quaternary circle @click.stop="handleTools">
              <template #icon><NIcon :component="ExtensionPuzzleOutline" /></template>
            </NButton>
          </template>
          {{ t('pages.agents.actions.tools') }}
        </NTooltip>
        <NTooltip v-if="!isMain">
          <template #trigger>
            <NButton size="tiny" quaternary circle type="error" @click.stop="handleDelete">
              <template #icon><NIcon :component="TrashOutline" /></template>
            </NButton>
          </template>
          {{ t('common.delete') }}
        </NTooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-wrapper {
  position: relative;
}

.agent-wrapper.is-expanded {
  z-index: 10;
}

.agent-wrapper.is-expanded .agent-sessions-container {
  position: relative;
  left: auto;
  right: auto;
  top: auto;
  margin-top: 16px;
}

.agent-wrapper.is-expanded .agent-sessions {
  min-width: auto;
  width: 100%;
}

.agent-character {
  position: relative;
  padding: 16px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: hidden;
}

.agent-character::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--agent-color);
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.agent-character:hover {
  border-color: var(--agent-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.agent-character:hover::before {
  opacity: 1;
}

.agent-character.is-selected {
  border-color: var(--agent-color);
  box-shadow: 0 0 20px rgba(var(--agent-color), 0.15);
}

.agent-character.is-selected::before {
  opacity: 1;
}

.agent-character.is-compact {
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-avatar-container {
  position: relative;
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.agent-character.is-compact .agent-avatar-container {
  margin-bottom: 0;
}

.agent-avatar-ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  padding: 3px;
  background: linear-gradient(135deg, var(--agent-color), transparent);
}

.agent-character.is-compact .agent-avatar-ring {
  width: 40px;
  height: 40px;
}

.agent-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.agent-emoji {
  font-size: 32px;
}

.agent-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.agent-character.is-compact .agent-emoji {
  font-size: 20px;
}

.agent-status-indicator {
  position: absolute;
  bottom: 0;
  right: calc(50% - 32px);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
}

.agent-character.is-compact .agent-status-indicator {
  right: auto;
  left: 28px;
  width: 14px;
  height: 14px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--status-color);
}

.agent-character.is-compact .status-dot {
  width: 8px;
  height: 8px;
}

.agent-status-indicator.status-working .status-dot {
  animation: pulse 2s infinite;
}

.agent-status-indicator.status-communicating .status-dot {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}

.agent-activity-ring {
  position: absolute;
  top: 0;
  left: calc(50% - 32px);
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid var(--agent-color);
  opacity: 0;
  animation: activity-ring 2s infinite;
}

@keyframes activity-ring {
  0% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.4);
    opacity: 0;
  }
}

.agent-info {
  text-align: center;
}

.agent-character.is-compact .agent-info {
  flex: 1;
  text-align: left;
  min-width: 0;
}

.agent-name-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.agent-character.is-compact .agent-name-row {
  justify-content: flex-start;
}

.agent-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-stats {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 12px;
}

.agent-stat {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.agent-expand-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.agent-character:hover .agent-expand-btn {
  background: var(--agent-color);
  color: white;
}

.agent-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.agent-character:hover .agent-actions {
  opacity: 1;
}
</style>
