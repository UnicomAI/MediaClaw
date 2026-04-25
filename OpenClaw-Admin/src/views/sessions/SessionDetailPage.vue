<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NCard,
  NSpin,
  NSpace,
  NButton,
  NTag,
  NText,
  NIcon,
  NScrollbar,
  NPopconfirm,
  useMessage,
} from 'naive-ui'
import { ArrowBackOutline, RefreshOutline, TrashOutline, DownloadOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { formatDate, parseSessionKey, downloadJSON } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const message = useMessage()
const { t } = useI18n()

const sessionKey = computed(() => decodeURIComponent(route.params.key as string))
const parsed = computed(() => parseSessionKey(sessionKey.value))

onMounted(() => {
  sessionStore.fetchSession(sessionKey.value)
})

async function handleReset() {
  try {
    await sessionStore.resetSession(sessionKey.value)
    message.success(t('pages.sessions.detail.resetSuccess'))
    sessionStore.fetchSession(sessionKey.value)
  } catch {
    message.error(t('pages.sessions.detail.resetFailed'))
  }
}

async function handleDelete() {
  try {
    await sessionStore.deleteSession(sessionKey.value)
    message.success(t('pages.sessions.detail.deleteSuccess'))
    router.push({ name: 'Sessions' })
  } catch {
    message.error(t('pages.sessions.detail.deleteFailed'))
  }
}

async function handleExport() {
  try {
    const data = await sessionStore.exportSession(sessionKey.value)
    downloadJSON(data, `session-${sessionKey.value.replace(/:/g, '-')}.json`)
    message.success(t('pages.sessions.detail.exportSuccess'))
  } catch {
    message.error(t('pages.sessions.detail.exportFailed'))
  }
}

function roleColor(role: string): string {
  switch (role) {
    case 'user': return '#2080f0'
    case 'assistant': return '#18a058'
    case 'tool': return '#f0a020'
    case 'system': return '#909399'
    default: return '#666'
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case 'user': return t('pages.sessions.roles.user')
    case 'assistant': return t('pages.sessions.roles.assistant')
    case 'tool': return t('pages.sessions.roles.tool')
    case 'system': return t('pages.sessions.roles.system')
    default: return role
  }
}
</script>

<template>
  <NSpace vertical :size="16">
    <NSpace align="center">
      <NButton quaternary circle @click="router.push({ name: 'Sessions' })">
        <template #icon>
          <NIcon :component="ArrowBackOutline" />
        </template>
      </NButton>
      <NText strong style="font-size: 18px;">{{ t('pages.sessions.detail.title') }}</NText>
      <NTag size="small" round :bordered="false">{{ parsed.channel }}</NTag>
      <NText depth="3">{{ parsed.peer }}</NText>
    </NSpace>

    <NSpin :show="sessionStore.loading">
      <NCard class="app-card">
        <template #header>
          <NSpace align="center">
            <NText>{{ t('pages.sessions.detail.transcript') }}</NText>
            <NTag v-if="sessionStore.currentSession" size="small" :bordered="false" round>
              {{ t('common.messagesCount', { count: sessionStore.currentSession.transcript?.length || 0 }) }}
            </NTag>
          </NSpace>
        </template>
        <template #header-extra>
          <NSpace :size="8" class="app-toolbar">
            <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" @click="sessionStore.fetchSession(sessionKey)">
              <template #icon><NIcon :component="RefreshOutline" /></template>
              {{ t('common.refresh') }}
            </NButton>
            <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" @click="handleExport">
              <template #icon><NIcon :component="DownloadOutline" /></template>
              {{ t('common.export') }}
            </NButton>
            <NPopconfirm @positive-click="handleReset">
              <template #trigger>
                <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh">
                  <template #icon><NIcon :component="RefreshOutline" /></template>
                  {{ t('common.reset') }}
                </NButton>
              </template>
              {{ t('pages.sessions.detail.confirmReset') }}
            </NPopconfirm>
            <NPopconfirm @positive-click="handleDelete">
              <template #trigger>
                <NButton size="small" type="error" class="app-toolbar-btn">
                  <template #icon><NIcon :component="TrashOutline" /></template>
                  {{ t('common.delete') }}
                </NButton>
              </template>
              {{ t('pages.sessions.detail.confirmDelete') }}
            </NPopconfirm>
          </NSpace>
        </template>

        <NScrollbar style="max-height: calc(100vh - 240px);">
          <div
            v-if="sessionStore.currentSession?.transcript?.length"
            style="display: flex; flex-direction: column; gap: 12px; padding: 4px 0;"
          >
            <div
              v-for="(msg, index) in sessionStore.currentSession.transcript"
              :key="index"
              style="display: flex; gap: 12px; padding: 12px; border-radius: 8px;"
              :style="{ backgroundColor: msg.role === 'assistant' ? 'var(--bg-secondary)' : 'transparent' }"
            >
              <NTag
                size="small"
                :bordered="false"
                round
                :color="{ color: roleColor(msg.role) + '18', textColor: roleColor(msg.role) }"
                style="flex-shrink: 0; height: 22px;"
              >
                {{ roleLabel(msg.role) }}
              </NTag>
              <div style="flex: 1; min-width: 0;">
                <div style="white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.6;">
                  {{ msg.content }}
                </div>
                <NText
                  v-if="msg.timestamp"
                  depth="3"
                  style="font-size: 11px; margin-top: 4px; display: block;"
                >
                  {{ formatDate(msg.timestamp) }}
                </NText>
              </div>
            </div>
          </div>
          <div v-else style="text-align: center; padding: 60px 0; color: var(--text-secondary);">
            {{ t('common.noMessages') }}
          </div>
        </NScrollbar>
      </NCard>
    </NSpin>
  </NSpace>
</template>
