<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NIcon, NEmpty } from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'
import ConfigField from './ConfigField.vue'
import type { ConfigFieldSchema } from '@/api/hermes/types'

export interface ConfigCategory {
  id: string
  name: string
  description?: string
}

const props = defineProps<{
  category: ConfigCategory | null
  fields: ConfigFieldSchema[]
  values: Record<string, unknown>
  modified: Record<string, boolean>
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:value', key: string, value: unknown): void
  (e: 'reset', key: string): void
}>()

const hasFields = computed(() => props.fields.length > 0)

const modifiedCount = computed(() => {
  return Object.values(props.modified).filter(Boolean).length
})

function handleValueChange(key: string, value: unknown) {
  emit('update:value', key, value)
}

function handleReset(key: string) {
  emit('reset', key)
}

function isModified(key: string): boolean {
  return props.modified[key] || false
}

/**
 * 获取嵌套路径的值
 * 支持 'terminal.backend' 这样的路径访问 values.terminal.backend
 */
function getValue(key: string): unknown {
  const parts = key.split('.')
  let value: unknown = props.values
  
  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined
    }
    if (typeof value === 'object') {
      value = (value as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  
  return value
}
</script>

<template>
  <div class="config-form-section">
    <div v-if="category" class="config-form-section-header">
      <div class="config-form-section-title-row">
        <h2 class="config-form-section-title">{{ category.name }}</h2>
        <span v-if="modifiedCount > 0" class="config-form-section-modified-count">
          {{ modifiedCount }} 项已修改
        </span>
      </div>
      <p v-if="category.description" class="config-form-section-description">
        {{ category.description }}
      </p>
    </div>

    <div v-if="hasFields" class="config-form-section-fields">
      <div class="config-form-section-field-list">
        <div
          v-for="field in fields"
          :key="field.key"
          class="config-form-section-field-wrapper"
        >
          <ConfigField
            :field="field"
            :value="getValue(field.key)"
            :modified="isModified(field.key)"
            :disabled="disabled"
            @update:value="(v) => handleValueChange(field.key, v)"
          />
          <NButton
            v-if="isModified(field.key)"
            text
            size="small"
            class="config-form-section-reset-btn"
            @click="handleReset(field.key)"
          >
            <template #icon>
              <NIcon :component="RefreshOutline" />
            </template>
            重置
          </NButton>
        </div>
      </div>
    </div>

    <div v-else class="config-form-section-empty">
      <NEmpty description="该分类下暂无配置项">
        <template #extra>
          <p class="config-form-section-empty-hint">
            请从左侧选择其他分类查看配置
          </p>
        </template>
      </NEmpty>
    </div>
  </div>
</template>

<style scoped>
.config-form-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.config-form-section-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}

.config-form-section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.config-form-section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.config-form-section-modified-count {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--modified-badge-bg, rgba(245, 158, 11, 0.12));
  color: var(--modified-badge-color, #f59e0b);
  font-weight: 500;
}

.config-form-section-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 8px 0 0;
  line-height: 1.5;
}

.config-form-section-fields {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.config-form-section-field-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-form-section-field-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-form-section-reset-btn {
  align-self: flex-end;
  color: var(--text-secondary);
  font-size: 12px;
}

.config-form-section-reset-btn:hover {
  color: var(--modified-badge-color, #f59e0b);
}

.config-form-section-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.config-form-section-empty-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 8px;
}

[data-theme='dark'] .config-form-section-modified-count {
  background: rgba(251, 191, 36, 0.18);
  color: #fbbf24;
}

[data-theme='dark'] .config-form-section-reset-btn:hover {
  color: #fbbf24;
}

[data-theme='dark'] .config-form-section-header {
  background: var(--bg-card);
  border-bottom-color: var(--border-color);
}

[data-theme='dark'] .config-form-section-fields {
  background: var(--bg-primary);
}
</style>
