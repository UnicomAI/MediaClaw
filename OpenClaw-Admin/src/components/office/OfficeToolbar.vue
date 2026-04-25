<script setup lang="ts">
import { NButton, NIcon, NText, NSpace } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { 
  AddOutline, 
  RefreshOutline,
  PeopleOutline,
  FlashOutline,
  StatsChartOutline,
  ExtensionPuzzleOutline,
} from '@vicons/ionicons5'

const { t } = useI18n()

defineProps<{
  activeCount: number
  totalAgents: number
  totalTokens: number
}>()

const emit = defineEmits<{
  'create-agent': []
  'refresh': []
  'permission-control': []
}>()

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return String(tokens)
}
</script>

<template>
  <div class="office-toolbar">
    <div class="toolbar-left">
      <div class="toolbar-title">
        <NIcon :size="20" :component="PeopleOutline" />
        <span>{{ t('myworld.myEmployees') }}</span>
      </div>
    </div>
    
    <div class="toolbar-center">
      <div class="stat-badge">
        <NIcon :size="14" :component="FlashOutline" />
        <span class="stat-value">{{ activeCount }}</span>
        <span class="stat-label">{{ t('myworld.working') }}</span>
      </div>
      
      <div class="stat-badge">
        <NIcon :size="14" :component="PeopleOutline" />
        <span class="stat-value">{{ totalAgents }}</span>
        <span class="stat-label">{{ t('myworld.totalEmployees') }}</span>
      </div>
      
      <div class="stat-badge">
        <NIcon :size="14" :component="StatsChartOutline" />
        <span class="stat-value">{{ formatTokens(totalTokens) }}</span>
        <span class="stat-label">Token</span>
      </div>
    </div>
    
    <div class="toolbar-right">
      <NButton quaternary size="small" @click="emit('create-agent')">
        <template #icon>
          <NIcon :component="AddOutline" />
        </template>
        {{ t('myworld.addEmployee') }}
      </NButton>
      
      <NButton quaternary size="small" @click="emit('permission-control')">
        <template #icon>
          <NIcon :component="ExtensionPuzzleOutline" />
        </template>
        {{ t('myworld.permissionControl') }}
      </NButton>
      
      <NButton quaternary size="small" @click="emit('refresh')">
        <template #icon>
          <NIcon :component="RefreshOutline" />
        </template>
        {{ t('myworld.refresh') }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.office-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid var(--border-color, #333);
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.toolbar-center {
  display: flex;
  gap: 20px;
}

.stat-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.stat-label {
  font-size: 11px;
  color: #999;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}
</style>
