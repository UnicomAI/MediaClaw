<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NList, NListItem, NTag, NButton, NSpace, NEmpty, NIcon } from 'naive-ui'
import { DesktopOutline, TrashOutline } from '@vicons/ionicons5'
import type { RemoteDesktopSession, RemoteDesktopStatus } from '@/api/types'
import { useI18n } from 'vue-i18n'

interface Props {
  sessions: RemoteDesktopSession[]
  currentSessionId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'session-select': [session: RemoteDesktopSession]
  'session-destroy': [sessionId: string]
}>()

const { t } = useI18n()

const sortedSessions = computed(() => {
  return [...props.sessions].sort((a, b) => b.lastActivityAt - a.lastActivityAt)
})

function getStatusType(status: RemoteDesktopStatus): 'success' | 'warning' | 'error' | 'default' | 'info' {
  switch (status) {
    case 'connected':
      return 'success'
    case 'ready':
      return 'info'
    case 'creating':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
}

function getStatusLabel(status: RemoteDesktopStatus): string {
  const statusMap: Record<RemoteDesktopStatus, string> = {
    creating: t('pages.remoteDesktop.status.connecting'),
    ready: t('common.enabled'),
    connected: t('pages.remoteDesktop.status.connected'),
    disconnected: t('pages.remoteDesktop.status.disconnected'),
    error: t('pages.remoteDesktop.status.error'),
    destroyed: t('common.disabled'),
  }
  return statusMap[status] || status
}

function getPlatformLabel(platform: string): string {
  const platformMap: Record<string, string> = {
    linux: t('pages.remoteDesktop.platform.linux'),
    windows: t('pages.remoteDesktop.platform.windows'),
    unknown: t('pages.remoteDesktop.platform.unknown'),
  }
  return platformMap[platform] || platform
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { timeZone: 'Asia/Shanghai' })
}

function handleSelect(session: RemoteDesktopSession) {
  emit('session-select', session)
}

function handleDestroy(sessionId: string, event: Event) {
  event.stopPropagation()
  emit('session-destroy', sessionId)
}
</script>

<template>
  <NCard :title="$t('pages.remoteDesktop.session')" size="small" class="session-list-card">
    <template #header-extra>
      <NTag :bordered="false" size="small">
        {{ sessions.length }} {{ $t('common.itemsCount', { count: '' }) }}
      </NTag>
    </template>

    <NEmpty v-if="sessions.length === 0" :description="$t('common.empty')" />

    <NList v-else hoverable clickable>
      <NListItem
        v-for="session in sortedSessions"
        :key="session.id"
        :class="{ 'session-item--active': session.id === currentSessionId }"
        @click="handleSelect(session)"
      >
        <template #prefix>
          <NIcon :component="DesktopOutline" :size="24" />
        </template>

        <div class="session-item-content">
          <div class="session-item-header">
            <span class="session-id">{{ session.id.slice(0, 8) }}...</span>
            <NTag :type="getStatusType(session.status)" size="small" :bordered="false" round>
              {{ getStatusLabel(session.status) }}
            </NTag>
          </div>
          <div class="session-item-meta">
            <NSpace :size="8">
              <NTag size="small" :bordered="false">
                {{ getPlatformLabel(session.platform) }}
              </NTag>
              <span class="meta-text">{{ session.width }}x{{ session.height }}</span>
              <span v-if="session.nodeName" class="meta-text">{{ session.nodeName }}</span>
            </NSpace>
          </div>
          <div class="session-item-time">
            {{ formatTime(session.lastActivityAt) }}
          </div>
        </div>

        <template #suffix>
          <NButton
            size="tiny"
            quaternary
            circle
            @click="handleDestroy(session.id, $event)"
          >
            <template #icon>
              <NIcon :component="TrashOutline" />
            </template>
          </NButton>
        </template>
      </NListItem>
    </NList>
  </NCard>
</template>

<style scoped>
.session-list-card {
  height: 100%;
}

.session-item--active {
  background: var(--item-color-hover);
}

.session-item-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-id {
  font-family: monospace;
  font-size: 13px;
  font-weight: 500;
}

.session-item-meta {
  display: flex;
  align-items: center;
}

.meta-text {
  font-size: 12px;
  color: var(--text-color-3);
}

.session-item-time {
  font-size: 11px;
  color: var(--text-color-3);
}
</style>
