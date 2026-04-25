<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns, FormInst, FormRules, SelectOption } from 'naive-ui'
import {
  AddOutline,
  RefreshOutline,
  TrashOutline,
  PlayOutline,
  PauseOutline,
  FlashOutline,
  SearchOutline,
  TimerOutline,
  CheckmarkCircleOutline,
  PauseCircleOutline,
  StatsChartOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useHermesCronStore } from '@/stores/hermes/cron'
import type { HermesCronJob } from '@/api/hermes/types'

const { t } = useI18n()
const cronStore = useHermesCronStore()
const message = useMessage()

// ---- 搜索与筛选 ----

const searchQuery = ref('')
const statusFilter = ref<string>('all')

type StatusFilterValue = 'all' | 'active' | 'paused'

const statusOptions = computed<SelectOption[]>(() => [
  { label: t('pages.hermesCron.filter.all'), value: 'all' },
  { label: t('pages.hermesCron.filter.active'), value: 'active' },
  { label: t('pages.hermesCron.filter.paused'), value: 'paused' },
])

const filteredJobs = computed(() => {
  let list = cronStore.jobs

  if (searchQuery.value.trim()) {
    const keyword = searchQuery.value.trim().toLowerCase()
    list = list.filter(
      (job) =>
        job.name.toLowerCase().includes(keyword) ||
        (job.command || '').toLowerCase().includes(keyword) ||
        (job.description || '').toLowerCase().includes(keyword),
    )
  }

  const filter = statusFilter.value as StatusFilterValue
  if (filter === 'active') {
    list = list.filter((job) => job.enabled)
  } else if (filter === 'paused') {
    list = list.filter((job) => !job.enabled)
  }

  return list
})

// ---- 统计面板 ----

const stats = computed(() => {
  const all = cronStore.jobs
  const active = all.filter((j) => j.enabled).length
  const paused = all.filter((j) => !j.enabled).length

  // 计算上次运行成功率
  const withStatus = all.filter((j) => j.lastStatus)
  const successCount = withStatus.filter((j) => j.lastStatus === 'ok').length
  const successRate = withStatus.length > 0 ? Math.round((successCount / withStatus.length) * 100) : null

  return {
    total: all.length,
    active,
    paused,
    successRate,
  }
})

// ---- 批量操作 ----

const checkedRowKeys = ref<string[]>([])
const batchLoading = ref(false)

function handleCheckedRowKeysChange(keys: Array<string | number>) {
  checkedRowKeys.value = keys.map(String)
}

async function handleBatchPause() {
  if (checkedRowKeys.value.length === 0) return
  batchLoading.value = true
  try {
    await Promise.all(checkedRowKeys.value.map((id) => cronStore.pauseJob(id)))
    message.success(t('pages.hermesCron.batchPauseSuccess', { count: checkedRowKeys.value.length }))
    checkedRowKeys.value = []
  } catch {
    message.error(t('pages.hermesCron.batchPauseFailed'))
  } finally {
    batchLoading.value = false
  }
}

async function handleBatchResume() {
  if (checkedRowKeys.value.length === 0) return
  batchLoading.value = true
  try {
    await Promise.all(checkedRowKeys.value.map((id) => cronStore.resumeJob(id)))
    message.success(t('pages.hermesCron.batchResumeSuccess', { count: checkedRowKeys.value.length }))
    checkedRowKeys.value = []
  } catch {
    message.error(t('pages.hermesCron.batchResumeFailed'))
  } finally {
    batchLoading.value = false
  }
}

async function handleBatchDelete() {
  if (checkedRowKeys.value.length === 0) return
  batchLoading.value = true
  try {
    await Promise.all(checkedRowKeys.value.map((id) => cronStore.deleteJob(id)))
    message.success(t('pages.hermesCron.batchDeleteSuccess', { count: checkedRowKeys.value.length }))
    checkedRowKeys.value = []
  } catch {
    message.error(t('pages.hermesCron.batchDeleteFailed'))
  } finally {
    batchLoading.value = false
  }
}

// ---- 表单与模态框 ----

const showCreateModal = ref(false)
const showEditModal = ref(false)
const editingJob = ref<HermesCronJob | null>(null)
const formLoading = ref(false)
const formRef = ref<FormInst | null>(null)
const formData = ref({
  name: '',
  description: '',
  schedule: '',
  command: '',
  timezone: 'UTC',
  enabled: true,
})

const formRules = computed<FormRules>(() => ({
  name: [
    { required: true, message: t('pages.hermesCron.form.nameRequired'), trigger: 'blur' },
  ],
  command: [
    { required: true, message: t('pages.hermesCron.form.commandRequired'), trigger: 'blur' },
  ],
}))

// ---- 表格列定义 ----

const columns = computed<DataTableColumns<HermesCronJob>>(() => [
  {
    type: 'selection',
    width: 48,
    disabled(row) {
      return false
    },
  },
  {
    title: t('pages.hermesCron.columns.name'),
    key: 'name',
    minWidth: 150,
    render(row) {
      return h(NSpace, { vertical: true, size: 2 }, () => [
        h(NText, { strong: true, style: 'font-size: 13px;' }, { default: () => row.name }),
        row.description
          ? h(NText, { depth: 3, style: 'font-size: 12px;' }, { default: () => row.description })
          : null,
      ])
    },
  },
  {
    title: t('pages.hermesCron.columns.schedule'),
    key: 'schedule',
    width: 140,
    render(row) {
      return h(NTag, { size: 'small', bordered: false, monospace: true, type: 'info' }, { default: () => row.schedule })
    },
  },
  {
    title: t('pages.hermesCron.columns.command'),
    key: 'command',
    minWidth: 180,
    ellipsis: { tooltip: true },
    render(row) {
      return row.command || '-'
    },
  },
  {
    title: t('pages.hermesCron.columns.status'),
    key: 'status',
    width: 100,
    render(row) {
      const type = row.enabled ? 'success' : 'warning'
      const label = row.enabled ? t('pages.hermesCron.statusActive') : t('pages.hermesCron.statusPaused')
      return h(NTag, { type, size: 'small', bordered: false, round: true }, {
        default: () => label,
      })
    },
  },
  {
    title: t('pages.hermesCron.columns.lastStatus'),
    key: 'lastStatus',
    width: 110,
    render(row) {
      if (!row.lastStatus) return h(NText, { depth: 3 }, { default: () => '-' })
      const typeMap: Record<string, 'success' | 'error' | 'warning'> = {
        ok: 'success',
        error: 'error',
        skipped: 'warning',
      }
      return h(NTag, { type: typeMap[row.lastStatus] || 'default', size: 'small', bordered: false, round: true }, {
        default: () => row.lastStatus,
      })
    },
  },
  {
    title: t('pages.hermesCron.columns.nextRun'),
    key: 'nextRun',
    width: 180,
    render(row) {
      return row.nextRun || '-'
    },
  },
  {
    title: t('pages.hermesCron.columns.actions'),
    key: 'actions',
    width: 240,
    fixed: 'right',
    render(row) {
      return h(NSpace, { size: 4, wrap: false }, () => [
        row.enabled
          ? h(NButton, {
              size: 'small',
              secondary: true,
              class: 'app-toolbar-btn',
              onClick: () => handlePause(row.id),
            }, { icon: () => h(NIcon, { component: PauseOutline }), default: () => t('pages.hermesCron.pause') })
          : h(NButton, {
              size: 'small',
              type: 'success',
              secondary: true,
              class: 'app-toolbar-btn',
              onClick: () => handleResume(row.id),
            }, { icon: () => h(NIcon, { component: PlayOutline }), default: () => t('pages.hermesCron.resume') }),
        h(NButton, {
          size: 'small',
          secondary: true,
          class: 'app-toolbar-btn',
          onClick: () => handleTrigger(row.id),
        }, { icon: () => h(NIcon, { component: FlashOutline }), default: () => t('pages.hermesCron.trigger') }),
        h(NButton, {
          size: 'small',
          secondary: true,
          class: 'app-toolbar-btn',
          onClick: () => openEditModal(row),
        }, { default: () => t('common.edit') }),
        h(NPopconfirm, { onPositiveClick: () => handleDelete(row.id) }, {
          trigger: () => h(NButton, {
            size: 'small',
            type: 'error',
            secondary: true,
            class: 'app-toolbar-btn',
          }, { icon: () => h(NIcon, { component: TrashOutline }) }),
          default: () => t('pages.hermesCron.confirmDelete'),
        }),
      ])
    },
  },
])

// ---- 生命周期 ----

onMounted(() => {
  cronStore.fetchJobs().catch(() => {
    message.error(t('pages.hermesCron.loadFailed'))
  })
})

// ---- 操作 ----

async function handleRefresh() {
  try {
    await cronStore.fetchJobs()
  } catch {
    message.error(t('pages.hermesCron.loadFailed'))
  }
}

function openCreateModal() {
  formData.value = { name: '', description: '', schedule: '', command: '', timezone: 'UTC', enabled: true }
  showCreateModal.value = true
}

function openEditModal(job: HermesCronJob) {
  editingJob.value = job
  formData.value = {
    name: job.name,
    description: job.description || '',
    schedule: job.schedule,
    command: job.command || '',
    timezone: job.timezone || 'UTC',
    enabled: job.enabled,
  }
  showEditModal.value = true
}

async function handleCreate() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  formLoading.value = true
  try {
    await cronStore.createJob(formData.value)
    message.success(t('pages.hermesCron.createSuccess'))
    showCreateModal.value = false
  } catch {
    message.error(t('pages.hermesCron.createFailed'))
  } finally {
    formLoading.value = false
  }
}

async function handleEdit() {
  if (!editingJob.value) return
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  formLoading.value = true
  try {
    await cronStore.updateJob(editingJob.value.id, formData.value)
    message.success(t('pages.hermesCron.updateSuccess'))
    showEditModal.value = false
    editingJob.value = null
  } catch {
    message.error(t('pages.hermesCron.updateFailed'))
  } finally {
    formLoading.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await cronStore.deleteJob(id)
    message.success(t('pages.hermesCron.deleteSuccess'))
  } catch {
    message.error(t('pages.hermesCron.deleteFailed'))
  }
}

async function handlePause(id: string) {
  try {
    await cronStore.pauseJob(id)
    message.success(t('pages.hermesCron.pauseSuccess'))
  } catch {
    message.error(t('pages.hermesCron.pauseFailed'))
  }
}

async function handleResume(id: string) {
  try {
    await cronStore.resumeJob(id)
    message.success(t('pages.hermesCron.resumeSuccess'))
  } catch {
    message.error(t('pages.hermesCron.resumeFailed'))
  }
}

async function handleTrigger(id: string) {
  try {
    await cronStore.triggerJob(id)
    message.success(t('pages.hermesCron.triggerSuccess'))
  } catch {
    message.error(t('pages.hermesCron.triggerFailed'))
  }
}
</script>

<template>
  <div class="hermes-cron-page">
    <!-- 页面标题 -->
    <div class="hermes-cron-header">
      <h2 class="hermes-cron-title">{{ t('pages.hermesCron.title') }}</h2>
      <NSpace :size="8">
        <NButton size="small" type="primary" class="app-toolbar-btn" @click="openCreateModal">
          <template #icon><NIcon :component="AddOutline" /></template>
          {{ t('pages.hermesCron.create') }}
        </NButton>
        <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" :loading="cronStore.loading" @click="handleRefresh">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('common.refresh') }}
        </NButton>
      </NSpace>
    </div>

    <!-- 错误提示 -->
    <NAlert v-if="cronStore.lastError" type="error" :bordered="false" closable class="app-card">
      {{ cronStore.lastError }}
    </NAlert>

    <!-- 概览统计面板 -->
    <NCard :bordered="false" class="app-card hermes-stats-panel">
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="16" :y-gap="16">
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--blue">
              <NIcon :component="TimerOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesCron.stats.totalJobs') }}</NText>
              <div class="stat-value">{{ stats.total }}</div>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--green">
              <NIcon :component="CheckmarkCircleOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesCron.stats.activeJobs') }}</NText>
              <div class="stat-value">{{ stats.active }}</div>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--orange">
              <NIcon :component="PauseCircleOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesCron.stats.pausedJobs') }}</NText>
              <div class="stat-value">{{ stats.paused }}</div>
            </div>
          </div>
        </NGridItem>
        <NGridItem>
          <div class="stat-item">
            <div class="stat-icon stat-icon--purple">
              <NIcon :component="StatsChartOutline" :size="20" />
            </div>
            <div class="stat-content">
              <NText depth="3" class="stat-label">{{ t('pages.hermesCron.stats.successRate') }}</NText>
              <div class="stat-value">
                {{ stats.successRate !== null ? stats.successRate + '%' : '-' }}
              </div>
            </div>
          </div>
        </NGridItem>
      </NGrid>
    </NCard>

    <!-- 搜索与筛选栏 -->
    <NCard :bordered="false" class="app-card hermes-filter-bar">
      <NSpace :size="12" align="center">
        <NInput
          v-model:value="searchQuery"
          clearable
          :placeholder="t('pages.hermesCron.searchPlaceholder')"
          style="width: 280px;"
        >
          <template #prefix><NIcon :component="SearchOutline" /></template>
        </NInput>
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          style="width: 160px;"
        />
        <NText v-if="filteredJobs.length !== cronStore.jobs.length" depth="3" style="font-size: 12px; margin-left: auto;">
          {{ filteredJobs.length }} / {{ cronStore.jobs.length }}
        </NText>
      </NSpace>
    </NCard>

    <!-- 批量操作栏 -->
    <NCard v-if="checkedRowKeys.length > 0" :bordered="false" class="app-card hermes-batch-bar">
      <NSpace :size="8" align="center">
        <NText depth="3" style="font-size: 13px;">
          {{ t('pages.hermesCron.batchSelected', { count: checkedRowKeys.length }) }}
        </NText>
        <NButton size="small" secondary class="app-toolbar-btn" :loading="batchLoading" @click="handleBatchPause">
          <template #icon><NIcon :component="PauseOutline" /></template>
          {{ t('pages.hermesCron.batchPause') }}
        </NButton>
        <NButton size="small" type="success" secondary class="app-toolbar-btn" :loading="batchLoading" @click="handleBatchResume">
          <template #icon><NIcon :component="PlayOutline" /></template>
          {{ t('pages.hermesCron.batchResume') }}
        </NButton>
        <NPopconfirm @positive-click="handleBatchDelete">
          <template #trigger>
            <NButton size="small" type="error" secondary class="app-toolbar-btn" :loading="batchLoading">
              <template #icon><NIcon :component="TrashOutline" /></template>
              {{ t('pages.hermesCron.batchDelete') }}
            </NButton>
          </template>
          {{ t('pages.hermesCron.confirmBatchDelete') }}
        </NPopconfirm>
      </NSpace>
    </NCard>

    <!-- 数据表格 -->
    <NCard :bordered="false" class="app-card">
      <NDataTable
        :columns="columns"
        :data="filteredJobs"
        :loading="cronStore.loading"
        :bordered="false"
        :row-key="(row: HermesCronJob) => row.id"
        :checked-row-keys="checkedRowKeys"
        :pagination="{ pageSize: 15 }"
        :scroll-x="1200"
        striped
        @update:checked-row-keys="handleCheckedRowKeysChange"
      />

      <NText v-if="!cronStore.loading && cronStore.jobs.length === 0" depth="3" class="empty-state">
        {{ t('common.empty') }}
      </NText>
    </NCard>

    <!-- 创建模态框 -->
    <NModal
      v-model:show="showCreateModal"
      preset="card"
      :title="t('pages.hermesCron.createModal.title')"
      style="width: 520px; max-width: 90vw;"
      :mask-closable="false"
    >
      <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100">
        <NFormItem :label="t('pages.hermesCron.form.name')" path="name">
          <NInput v-model:value="formData.name" :placeholder="t('pages.hermesCron.form.namePlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.description')">
          <NInput v-model:value="formData.description" :placeholder="t('pages.hermesCron.form.descriptionPlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.schedule')">
          <NInput v-model:value="formData.schedule" :placeholder="t('pages.hermesCron.form.schedulePlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.command')" path="command">
          <NInput v-model:value="formData.command" type="textarea" :placeholder="t('pages.hermesCron.form.commandPlaceholder')" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.timezone')">
          <NInput v-model:value="formData.timezone" placeholder="UTC" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.enabled')">
          <NSwitch v-model:value="formData.enabled" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showCreateModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="formLoading" @click="handleCreate">{{ t('common.create') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 编辑模态框 -->
    <NModal
      v-model:show="showEditModal"
      preset="card"
      :title="t('pages.hermesCron.editModal.title')"
      style="width: 520px; max-width: 90vw;"
      :mask-closable="false"
    >
      <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100">
        <NFormItem :label="t('pages.hermesCron.form.name')" path="name">
          <NInput v-model:value="formData.name" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.description')">
          <NInput v-model:value="formData.description" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.schedule')">
          <NInput v-model:value="formData.schedule" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.command')" path="command">
          <NInput v-model:value="formData.command" type="textarea" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.timezone')">
          <NInput v-model:value="formData.timezone" />
        </NFormItem>
        <NFormItem :label="t('pages.hermesCron.form.enabled')">
          <NSwitch v-model:value="formData.enabled" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showEditModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="formLoading" @click="handleEdit">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.hermes-cron-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---- 页面标题 ---- */

.hermes-cron-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hermes-cron-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

/* ---- 概览统计面板 ---- */

.hermes-stats-panel {
  background: linear-gradient(135deg, rgba(22, 163, 74, 0.08), rgba(59, 130, 246, 0.08));
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius, 8px);
  flex-shrink: 0;
}

.stat-icon--blue {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.stat-icon--green {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
}

.stat-icon--orange {
  background: rgba(249, 115, 22, 0.12);
  color: #f97316;
}

.stat-icon--purple {
  background: rgba(139, 92, 246, 0.12);
  color: #8b5cf6;
}

.stat-content {
  min-width: 0;
}

.stat-label {
  font-size: 12px;
  display: block;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  margin-top: 4px;
  line-height: 1.2;
}

/* ---- 搜索与筛选栏 ---- */

.hermes-filter-bar :deep(.n-card__content) {
  padding: 12px 16px !important;
}

/* ---- 批量操作栏 ---- */

.hermes-batch-bar :deep(.n-card__content) {
  padding: 10px 16px !important;
}

.hermes-batch-bar {
  border-left: 3px solid var(--primary-color, #16a34a);
}

/* ---- 空状态 ---- */

.empty-state {
  display: block;
  text-align: center;
  padding: 40px 0;
}

/* ---- 按钮悬浮动画 ---- */

:deep(.app-toolbar-btn) {
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

:deep(.app-toolbar-btn:hover) {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.app-toolbar-btn:active) {
  transform: translateY(0);
  box-shadow: none;
}

/* ---- 刷新按钮旋转 ---- */

:deep(.app-toolbar-btn--refresh.is-loading) {
  animation: hermes-spin 0.8s linear infinite;
}

@keyframes hermes-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
