<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NButton,
  NIcon,
  NSpace,
  NInput,
  NTooltip,
  useMessage,
} from 'naive-ui'
import {
  SaveOutline,
  RefreshOutline,
  DownloadOutline,
} from '@vicons/ionicons5'
import ConfigCategoryNav, { type ConfigCategory } from './ConfigCategoryNav.vue'
import ConfigFormSection from './ConfigFormSection.vue'
import type { ConfigFieldSchema } from '@/api/hermes/types'

export interface ConfigSchema {
  categories: ConfigCategory[]
  fields: Record<string, ConfigFieldSchema[]>
}

const props = withDefaults(defineProps<{
  modelValue: Record<string, unknown>
  schema: ConfigSchema
  disabled?: boolean
  saving?: boolean
  mode?: 'visual' | 'yaml'
}>(), {
  mode: 'visual',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, unknown>): void
  (e: 'save'): void
  (e: 'reset'): void
}>()

const message = useMessage()

const activeCategory = ref<string | null>(null)
const localValues = ref<Record<string, unknown>>({})
const originalValues = ref<Record<string, unknown>>({})
const yamlContent = ref('')

/**
 * 获取嵌套路径的值
 * 支持 'terminal.backend' 这样的路径访问 obj.terminal.backend
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let value: unknown = obj
  
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

/**
 * 设置嵌套路径的值
 * 支持 'terminal.backend' 这样的路径设置 obj.terminal.backend
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let current: Record<string, unknown> = obj
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }
  
  current[parts[parts.length - 1]!] = value
}

const categoriesWithModified = computed(() => {
  return props.schema.categories.map((cat) => {
    const catFields = props.schema.fields[cat.id] || []
    const modifiedCount = catFields.filter((field) => {
      const original = getNestedValue(originalValues.value, field.key)
      const current = getNestedValue(localValues.value, field.key)
      return JSON.stringify(original) !== JSON.stringify(current)
    }).length
    return { ...cat, modifiedCount }
  })
})

const currentCategory = computed(() => {
  if (!activeCategory.value) return null
  return props.schema.categories.find((c) => c.id === activeCategory.value) || null
})

const currentFields = computed(() => {
  if (!activeCategory.value) return []
  return props.schema.fields[activeCategory.value] || []
})

const modified = computed(() => {
  const result: Record<string, boolean> = {}
  // 遍历所有字段定义来检查修改状态
  for (const category of props.schema.categories) {
    const fields = props.schema.fields[category.id] || []
    for (const field of fields) {
      const original = getNestedValue(originalValues.value, field.key)
      const current = getNestedValue(localValues.value, field.key)
      result[field.key] = JSON.stringify(original) !== JSON.stringify(current)
    }
  }
  return result
})

const hasModifications = computed(() => {
  return Object.values(modified.value).some(Boolean)
})

const totalModifiedCount = computed(() => {
  return Object.values(modified.value).filter(Boolean).length
})

function initializeValues() {
  localValues.value = { ...props.modelValue }
  originalValues.value = { ...props.modelValue }
  yamlContent.value = JSON.stringify(props.modelValue, null, 2)
  if (props.schema.categories.length > 0 && !activeCategory.value) {
    activeCategory.value = props.schema.categories[0]?.id ?? null
  }
}

watch(
  () => props.modelValue,
  () => {
    initializeValues()
  },
  { immediate: true, deep: true }
)

function handleCategoryChange(categoryId: string) {
  activeCategory.value = categoryId
}

function handleValueChange(key: string, value: unknown) {
  setNestedValue(localValues.value, key, value)
  emit('update:modelValue', { ...localValues.value })
}

function handleReset(key: string) {
  const originalValue = getNestedValue(originalValues.value, key)
  setNestedValue(localValues.value, key, originalValue)
  emit('update:modelValue', { ...localValues.value })
}

function handleSave() {
  if (!hasModifications.value) {
    message.info('没有需要保存的修改')
    return
  }
  emit('save')
}

function handleResetAll() {
  emit('reset')
  localValues.value = { ...originalValues.value }
  emit('update:modelValue', { ...localValues.value })
}

function handleExport() {
  const dataStr = JSON.stringify(localValues.value, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'config.json'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function handleYamlChange(value: string) {
  yamlContent.value = value
  try {
    const parsed = JSON.parse(value)
    localValues.value = parsed
    emit('update:modelValue', parsed)
  } catch {
    // Invalid JSON, ignore
  }
}
</script>

<template>
  <div class="config-editor-panel">
    <div class="config-editor-toolbar">
      <div class="config-editor-toolbar-left">
        <span v-if="hasModifications" class="config-editor-modified-indicator">
          {{ totalModifiedCount }} 项待保存
        </span>
      </div>

      <div class="config-editor-toolbar-right">
        <NSpace>
          <NTooltip trigger="hover">
            <template #trigger>
              <NButton
                :disabled="!hasModifications || disabled"
                class="app-toolbar-btn app-toolbar-btn--refresh"
                @click="handleResetAll"
              >
                <template #icon>
                  <NIcon :component="RefreshOutline" />
                </template>
                重置
              </NButton>
            </template>
            撤销所有未保存的修改
          </NTooltip>

          <NTooltip trigger="hover">
            <template #trigger>
              <NButton
                class="app-toolbar-btn app-toolbar-btn--apply"
                @click="handleExport"
              >
                <template #icon>
                  <NIcon :component="DownloadOutline" />
                </template>
                导出
              </NButton>
            </template>
            导出配置为 JSON 文件
          </NTooltip>

          <NTooltip trigger="hover">
            <template #trigger>
              <NButton
                :disabled="!hasModifications || disabled"
                :loading="saving"
                class="app-toolbar-btn app-toolbar-btn--save"
                @click="handleSave"
              >
                <template #icon>
                  <NIcon :component="SaveOutline" />
                </template>
                保存
              </NButton>
            </template>
            保存所有修改
          </NTooltip>
        </NSpace>
      </div>
    </div>

    <div class="config-editor-content">
      <template v-if="mode === 'visual'">
        <div class="config-editor-sidebar">
          <ConfigCategoryNav
            :categories="categoriesWithModified"
            :active-category="activeCategory"
            @update:active-category="handleCategoryChange"
          />
        </div>

        <div class="config-editor-main">
          <ConfigFormSection
            :category="currentCategory"
            :fields="currentFields"
            :values="localValues"
            :modified="modified"
            :disabled="disabled"
            @update:value="handleValueChange"
            @reset="handleReset"
          />
        </div>
      </template>

      <template v-else>
        <div class="config-editor-yaml">
          <NInput
            type="textarea"
            :value="yamlContent"
            placeholder="配置 JSON"
            :disabled="disabled"
            :rows="20"
            class="config-editor-yaml-input"
            @update:value="handleYamlChange"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.config-editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  border-radius: var(--card-radius-xl);
  overflow: hidden;
}

.config-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  gap: 16px;
}

.config-editor-toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.config-editor-modified-indicator {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: var(--modified-badge-bg, rgba(245, 158, 11, 0.12));
  color: var(--modified-badge-color, #f59e0b);
  font-weight: 500;
}

.config-editor-toolbar-right {
  display: flex;
  align-items: center;
}

.config-editor-content {
  flex: 1;
  display: flex;
  min-height: 0;
}

.config-editor-sidebar {
  width: 220px;
  flex-shrink: 0;
}

.config-editor-main {
  flex: 1;
  min-width: 0;
}

.config-editor-yaml {
  flex: 1;
  padding: 20px;
  background: var(--bg-card);
}

.config-editor-yaml-input {
  height: 100%;
}

.config-editor-yaml-input :deep(textarea) {
  height: 100% !important;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  background: var(--bg-secondary);
  border-color: var(--border-color);
}

[data-theme='dark'] .config-editor-modified-indicator {
  background: rgba(251, 191, 36, 0.18);
  color: #fbbf24;
}

[data-theme='dark'] .config-editor-yaml-input :deep(textarea) {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  color: var(--text-primary);
}
</style>
