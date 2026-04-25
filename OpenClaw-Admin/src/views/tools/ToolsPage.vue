<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  NCard,
  NDataTable,
  NButton,
  NSpace,
  NTag,
  NIcon,
  NInput,
  NSpin,
} from 'naive-ui'
import { RefreshOutline, SearchOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useWebSocketStore } from '@/stores/websocket'
import type { Tool } from '@/api/types'
import { h } from 'vue'

const wsStore = useWebSocketStore()
const { t } = useI18n()
const tools = ref<Tool[]>([])
const loading = ref(false)
const searchQuery = ref('')

const filteredTools = computed(() => {
  if (!searchQuery.value) return tools.value
  const q = searchQuery.value.toLowerCase()
  return tools.value.filter(
    (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
  )
})

const columns = computed(() => ([
  {
    title: t('pages.tools.columns.name'),
    key: 'name',
    width: 160,
    render(row: Tool) {
      return h(
        'span',
        { style: 'font-weight: 500; font-family: monospace;' },
        row.name
      )
    },
  },
  {
    title: t('pages.tools.columns.category'),
    key: 'category',
    width: 100,
    render(row: Tool) {
      return h(NTag, { size: 'small', bordered: false, round: true }, { default: () => row.category })
    },
  },
  {
    title: t('pages.tools.columns.description'),
    key: 'description',
    ellipsis: { tooltip: true },
  },
  {
    title: t('pages.tools.columns.status'),
    key: 'enabled',
    width: 80,
    render(row: Tool) {
      return h(
        NTag,
        {
          type: row.enabled ? 'success' : 'default',
          size: 'small',
          bordered: false,
          round: true,
        },
        { default: () => (row.enabled ? t('common.enabled') : t('common.disabled')) }
      )
    },
  },
]))

async function fetchTools() {
  loading.value = true
  try {
    tools.value = await wsStore.rpc.listTools()
  } catch {
    tools.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchTools)
</script>

<template>
  <NCard :title="t('pages.tools.title')" class="app-card">
    <template #header-extra>
      <NSpace :size="8" class="app-toolbar">
        <NInput
          v-model:value="searchQuery"
          :placeholder="t('pages.tools.searchPlaceholder')"
          size="small"
          clearable
          style="width: 200px;"
        >
          <template #prefix>
            <NIcon :component="SearchOutline" />
          </template>
        </NInput>
        <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" @click="fetchTools">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('common.refresh') }}
        </NButton>
      </NSpace>
    </template>

    <NDataTable
      :columns="columns"
      :data="filteredTools"
      :loading="loading"
      :bordered="false"
      :pagination="{ pageSize: 20 }"
      :row-key="(row: Tool) => row.name"
      striped
    />
  </NCard>
</template>
