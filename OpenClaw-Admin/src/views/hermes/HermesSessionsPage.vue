<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns, SelectOption } from 'naive-ui'
import {
  AddOutline,
  ChatbubblesOutline,
  FlashOutline,
  LogOutOutline,
  RefreshOutline,
  SearchOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useHermesSessionStore } from '@/stores/hermes/session'
import { useHermesChatStore } from '@/stores/hermes/chat'
import type { HermesSession } from '@/api/hermes/types'
import { formatDateShort } from '@/utils/format'

type SortMode = 'recent' | 'messages'

const { t } = useI18n()
const router = useRouter()
const sessionStore = useHermesSessionStore()
const chatStore = useHermesChatStore()
const message = useMessage()

// ---- 筛选状态 ----

const searchQuery = ref('')
const modelFilter = ref<string>('all')
const sortMode = ref<SortMode>('recent')
const checkedRowKeys = ref<string[]>([])
const batchDeleting = ref(false)

// ---- 排序选项 ----

const sortOptions = computed<SelectOption[]>(() => [
  { label: t('pages.hermesSessions.sort.recent'), value: 'recent' },
  { label: t('pages.hermesSessions.sort.messages'), value: 'messages' },
])

// ---- 模型筛选选项 ----

const modelOptions = computed<SelectOption[]>(() => {
  const set = new Set(
    sessionStore.sessions.map((s) => s.model || '').filter(Boolean),
  )
  return [
    { label: t('pages.hermesSessions.filters.allModels'), value: 'all' },
    ...Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((model) => ({ label: model, value: model })),
  ]
})

// ---- 统计数据 ----

const stats = computed(() => {
  const total = sessionStore.sessions.length
  const totalMessages = sessionStore.sessions.reduce(
    (acc, s) => acc + (s.messageCount || 0),
    0,
  )
  const activeSessions = sessionStore.sessions.filter(
    (s) => (s.messageCount || 0) > 0,
  ).length
  const uniqueModels = new Set(
    sessionStore.sessions.map((s) => s.model || '').filter(Boolean),
  ).size
  return { total, totalMessages, activeSessions, uniqueModels }
})

// ---- 筛选与会话列表 ----

const filteredSessions = computed<HermesSession[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()

  let list = sessionStore.sessions.filter((s) => {
    if (modelFilter.value !== 'all' && (s.model || '') !== modelFilter.value)
      return false
    if (!q) return true
    return (
      (s.title || s.id).toLowerCase().includes(q) ||
      (s.model || '').toLowerCase().includes(q)
    )
  })

  list = [...list].sort((a, b) => {
    if (sortMode.value === 'messages') {
      const diff = (b.messageCount || 0) - (a.messageCount || 0)
      if (diff !== 0) return diff
    }
    const tsA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const tsB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return tsB - tsA
  })

  return list
})

// ---- 全选 / 取消全选 ----

const allSessionIds = computed(() => filteredSessions.value.map((s) => s.id))
const isAllSelected = computed(() => {
  if (allSessionIds.value.length === 0) return false
  return allSessionIds.value.every((id) => checkedRowKeys.value.includes(id))
})
const isPartialSelected = computed(() => {
  if (allSessionIds.value.length === 0) return false
  const count = allSessionIds.value.filter((id) =>
    checkedRowKeys.value.includes(id),
  ).length
  return count > 0 && count < allSessionIds.value.length
})

function handleSelectAll() {
  if (isAllSelected.value) {
    checkedRowKeys.value = []
  } else {
    checkedRowKeys.value = [...allSessionIds.value]
  }
}

// ---- 表格列 ----

const columns = computed<DataTableColumns<HermesSession>>(() => [
  { type: 'selection' },
  {
    title: t('pages.hermesSessions.columns.sessionId'),
    key: 'id',
    width: 160,
    ellipsis: { tooltip: true },
    render(row) {
      return h('span', { style: 'font-family: var(--mono); font-size: 12px;' }, row.id)
    },
  },
  {
    title: t('pages.hermesSessions.columns.title'),
    key: 'title',
    width: 120,
    ellipsis: { tooltip: true },
    render(row) {
      return h(
        NText,
        { style: 'font-weight: 500;' },
        { default: () => row.title || '-' },
      )
    },
  },
  {
    title: t('pages.hermesSessions.columns.model'),
    key: 'model',
    width: 140,
    ellipsis: { tooltip: true },
    render(row) {
      return row.model
        ? h(
            NTag,
            { size: 'small', bordered: false, round: true, type: 'info' },
            { default: () => row.model },
          )
        : h(NText, { depth: 3 }, { default: () => '-' })
    },
  },
  {
    title: t('pages.hermesSessions.columns.messages'),
    key: 'messageCount',
    width: 80,
    sorter: (a, b) => (a.messageCount || 0) - (b.messageCount || 0),
    render(row) {
      return h(NText, { strong: true }, {
        default: () => row.messageCount || 0,
      })
    },
  },
  {
    title: t('pages.hermesSessions.columns.createdAt'),
    key: 'createdAt',
    width: 140,
    render(row) {
      return formatDateShort(row.createdAt || '')
    },
  },
  {
    title: t('pages.hermesSessions.columns.updatedAt'),
    key: 'updatedAt',
    width: 140,
    sorter: (a, b) => {
      const tsA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const tsB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return tsA - tsB
    },
    render(row) {
      return formatDateShort(row.updatedAt || '')
    },
  },
  {
    title: t('pages.hermesSessions.columns.actions'),
    key: 'actions',
    width: 130,
    render(row) {
      return h(NSpace, { size: 4, wrap: false, class: 'hermes-row-actions' }, () => [
        h(
          NButton,
          {
            size: 'tiny',
            type: 'primary',
            secondary: true,
            strong: true,
            class: 'hermes-action-btn hermes-action-btn--chat',
            onClick: () => handleJumpToChat(row),
          },
          {
            icon: () => h(NIcon, { component: FlashOutline }),
            default: () => t('pages.hermesSessions.jumpToChat'),
          },
        ),
        h(
          NPopconfirm,
          { onPositiveClick: () => handleDelete(row) },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: 'tiny',
                  type: 'error',
                  secondary: true,
                  strong: true,
                  class: 'hermes-action-btn hermes-action-btn--delete',
                },
                {
                  icon: () => h(NIcon, { component: TrashOutline }),
                  default: () => t('common.delete'),
                },
              ),
            default: () => t('pages.hermesSessions.confirmDelete'),
          },
        ),
      ])
    },
  },
])

// ---- 生命周期 ----

onMounted(() => {
  sessionStore.fetchSessions().catch(() => {
    message.error(t('pages.hermesSessions.loadFailed'))
  })
})

// ---- 操作方法 ----

function clearFilters() {
  searchQuery.value = ''
  modelFilter.value = 'all'
  sortMode.value = 'recent'
}

async function handleRefresh() {
  try {
    await sessionStore.fetchSessions()
  } catch {
    message.error(t('pages.hermesSessions.loadFailed'))
  }
}

async function handleDelete(session: HermesSession) {
  try {
    await sessionStore.deleteSession(session.id)
    message.success(t('pages.hermesSessions.deleteSuccess'))
  } catch {
    message.error(t('pages.hermesSessions.deleteFailed'))
  }
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) return
  batchDeleting.value = true
  try {
    let deletedCount = 0
    let failedCount = 0
    for (const id of checkedRowKeys.value) {
      try {
        await sessionStore.deleteSession(id)
        deletedCount++
      } catch {
        failedCount++
      }
    }
    if (failedCount > 0) {
      message.warning(
        t('pages.hermesSessions.batchDeletePartial', {
          deleted: deletedCount,
          failed: failedCount,
        }),
      )
    } else {
      message.success(
        t('pages.hermesSessions.batchDeleteSuccess', { count: deletedCount }),
      )
    }
    checkedRowKeys.value = []
  } catch {
    message.error(t('pages.hermesSessions.batchDeleteFailed'))
  } finally {
    batchDeleting.value = false
  }
}

async function handleJumpToChat(session: HermesSession) {
  try {
    await chatStore.loadSessionMessages(session.id)
    router.push('/hermes/chat')
  } catch {
    message.error(t('pages.hermesSessions.loadFailed'))
  }
}

function handleNewChat() {
  chatStore.clearMessages()
  router.push('/hermes/chat')
}
</script>

<template>
  <div class="hermes-sessions-page">
    <!-- Hero 统计面板 -->
    <NCard class="hermes-hero" :bordered="false">
      <template #header>
        <div class="hermes-hero-title">{{ t('pages.hermesSessions.title') }}</div>
      </template>
      <template #header-extra>
        <NSpace :size="8">
          <NButton
            size="small"
            type="success"
            secondary
            class="app-toolbar-btn"
            @click="handleNewChat"
          >
            <template #icon>
              <NIcon :component="AddOutline" />
            </template>
            {{ t('pages.hermesSessions.newChat') }}
          </NButton>
          <NButton
            v-if="filteredSessions.length > 0"
            size="small"
            :type="isAllSelected ? 'warning' : 'primary'"
            secondary
            class="app-toolbar-btn"
            @click="handleSelectAll"
          >
            <template #icon>
              <NIcon :component="isAllSelected ? LogOutOutline : ChatbubblesOutline" />
            </template>
            {{
              isAllSelected
                ? t('pages.hermesSessions.deselectAll')
                : t('pages.hermesSessions.selectAll')
            }}
            ({{ filteredSessions.length }})
          </NButton>
          <NPopconfirm
            v-if="checkedRowKeys.length > 0"
            :disabled="batchDeleting"
            @positive-click="handleBatchDelete"
          >
            <template #trigger>
              <NButton
                size="small"
                type="error"
                secondary
                class="app-toolbar-btn"
                :loading="batchDeleting"
                :disabled="batchDeleting"
              >
                <template #icon>
                  <NIcon :component="TrashOutline" />
                </template>
                {{
                  t('pages.hermesSessions.batchDelete', {
                    count: checkedRowKeys.length,
                  })
                }}
              </NButton>
            </template>
            {{
              t('pages.hermesSessions.confirmBatchDelete', {
                count: checkedRowKeys.length,
              })
            }}
          </NPopconfirm>
          <NButton
            size="small"
            secondary
            class="app-toolbar-btn app-toolbar-btn--refresh"
            :loading="sessionStore.loading"
            @click="handleRefresh"
          >
            <template #icon>
              <NIcon :component="RefreshOutline" />
            </template>
            {{ t('common.refresh') }}
          </NButton>
        </NSpace>
      </template>

      <NAlert v-if="sessionStore.lastError" type="error" :bordered="false" closable>
        {{ sessionStore.lastError }}
      </NAlert>

      <!-- 统计卡片 -->
      <NGrid
        cols="1 s:2 m:4"
        responsive="screen"
        :x-gap="10"
        :y-gap="10"
        style="margin-top: 12px;"
      >
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesSessions.metrics.totalSessions') }}</NText>
              <NIcon :component="ChatbubblesOutline" />
            </NSpace>
            <div class="hermes-metric-value">{{ stats.total }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesSessions.metrics.totalMessages') }}</NText>
              <NIcon :component="FlashOutline" />
            </NSpace>
            <div class="hermes-metric-value">{{ stats.totalMessages }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesSessions.metrics.activeSessions') }}</NText>
              <NIcon :component="RefreshOutline" />
            </NSpace>
            <div class="hermes-metric-value">{{ stats.activeSessions }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesSessions.metrics.uniqueModels') }}</NText>
              <NIcon :component="SearchOutline" />
            </NSpace>
            <div class="hermes-metric-value">{{ stats.uniqueModels }}</div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- 筛选栏 -->
      <div class="hermes-filter-bar">
        <NInput
          v-model:value="searchQuery"
          clearable
          :placeholder="t('pages.hermesSessions.searchPlaceholder')"
        >
          <template #prefix>
            <NIcon :component="SearchOutline" />
          </template>
        </NInput>
        <NSelect v-model:value="modelFilter" :options="modelOptions" />
        <NSelect v-model:value="sortMode" :options="sortOptions" />
        <NButton @click="clearFilters">
          {{ t('pages.hermesSessions.clearFilters') }}
        </NButton>
      </div>
    </NCard>

    <!-- 会话列表 -->
    <NCard :title="t('pages.hermesSessions.listTitle')" class="app-card">
      <template #header-extra>
        <NText depth="3" style="font-size: 12px;">
          {{
            t('pages.hermesSessions.listCount', {
              current: filteredSessions.length,
              total: stats.total,
            })
          }}
        </NText>
      </template>

      <NDataTable
        v-model:checked-row-keys="checkedRowKeys"
        :columns="columns"
        :data="filteredSessions"
        :loading="sessionStore.loading"
        :bordered="false"
        :row-key="(row: HermesSession) => row.id"
        :pagination="{ pageSize: 15 }"
        :scroll-x="1000"
        :max-height="600"
        striped
      />

      <NText
        v-if="!sessionStore.loading && filteredSessions.length === 0"
        depth="3"
        style="display: block; text-align: center; padding: 40px 0;"
      >
        {{ t('common.empty') }}
      </NText>
    </NCard>
  </div>
</template>

<style scoped>
.hermes-sessions-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---- Hero 面板 ---- */

.hermes-hero {
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 84% 16%, rgba(22, 163, 74, 0.22), transparent 36%),
    linear-gradient(135deg, rgba(22, 163, 74, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%);
  border: 1px solid rgba(22, 163, 74, 0.18);
}

.hermes-hero-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

/* ---- 统计卡片 ---- */

.hermes-metric-card {
  border-radius: 10px;
}

.hermes-metric-value {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

/* ---- 筛选栏 ---- */

.hermes-filter-bar {
  margin-top: 12px;
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr)) auto;
  gap: 8px;
}

@media (max-width: 900px) {
  .hermes-filter-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ---- 行操作按钮 ---- */

.hermes-row-actions {
  align-items: center;
  flex-wrap: nowrap;
}

.hermes-action-btn {
  min-width: auto;
  height: auto;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1px;
  transition: transform 0.14s ease, box-shadow 0.2s ease;
}

.hermes-action-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12);
}
</style>
