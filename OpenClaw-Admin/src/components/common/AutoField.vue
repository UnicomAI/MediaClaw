<script setup lang="ts">
import { computed } from 'vue'
import {
  NInput,
  NInputNumber,
  NSwitch,
  NSelect,
  NTooltip,
  NIcon,
} from 'naive-ui'
import { InformationCircleOutline } from '@vicons/ionicons5'

export interface ConfigSchema {
  type?: string
  description?: string
  default?: unknown
  enum?: string[]
  minimum?: number
  maximum?: number
  items?: ConfigSchema
  properties?: Record<string, ConfigSchema>
  category?: string
  section?: string
}

const props = defineProps<{
  schemaKey: string
  schema: ConfigSchema
  value: unknown
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:value', value: unknown): void
}>()

const label = computed(() => {
  const parts = props.schemaKey.split('.')
  return parts.pop() ?? props.schemaKey
})

const humanLabel = computed(() => {
  return label.value.replace(/_/g, ' ')
})

const inputType = computed(() => {
  const type = props.schema.type
  if (props.schema.enum?.length) return 'select'
  if (type === 'boolean') return 'switch'
  if (type === 'integer' || type === 'number') return 'number'
  if (type === 'array') return 'array'
  if (type === 'object') return 'object'
  return 'text'
})

const selectOptions = computed(() => {
  if (!props.schema.enum) return []
  return props.schema.enum.map((v) => ({
    label: v,
    value: v,
  }))
})

const numberMin = computed(() => props.schema.minimum ?? undefined)
const numberMax = computed(() => props.schema.maximum ?? undefined)

const arrayValue = computed({
  get: () => {
    if (Array.isArray(props.value)) {
      return props.value.join(', ')
    }
    return ''
  },
  set: (v: string) => {
    const arr = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    emit('update:value', arr)
  },
})

function handleTextChange(v: string) {
  emit('update:value', v || null)
}

function handleNumberChange(v: number | null) {
  emit('update:value', v)
}

function handleSwitchChange(v: boolean) {
  emit('update:value', v)
}

function handleSelectChange(v: string) {
  emit('update:value', v || null)
}

function handleArrayChange(v: string) {
  arrayValue.value = v
}
</script>

<template>
  <div class="auto-field">
    <div class="auto-field-header">
      <label class="auto-field-label">
        {{ humanLabel }}
        <span v-if="schema.description" class="auto-field-key">({{ label }})</span>
      </label>
      <NTooltip v-if="schema.description" trigger="hover" placement="top">
        <template #trigger>
          <NIcon :component="InformationCircleOutline" :size="14" class="auto-field-info" />
        </template>
        {{ schema.description }}
      </NTooltip>
    </div>

    <div class="auto-field-control">
      <template v-if="inputType === 'text'">
        <NInput
          :value="(value as string) ?? ''"
          :placeholder="String(schema.default ?? '')"
          :disabled="disabled"
          @update:value="handleTextChange"
        />
      </template>

      <template v-else-if="inputType === 'number'">
        <NInputNumber
          :value="(value as number) ?? null"
          :placeholder="String(schema.default ?? '')"
          :min="numberMin"
          :max="numberMax"
          :disabled="disabled"
          clearable
          @update:value="handleNumberChange"
        />
      </template>

      <template v-else-if="inputType === 'switch'">
        <NSwitch
          :value="(value as boolean) ?? false"
          :disabled="disabled"
          @update:value="handleSwitchChange"
        />
      </template>

      <template v-else-if="inputType === 'select'">
        <NSelect
          :value="(value as string) ?? null"
          :options="selectOptions"
          :disabled="disabled"
          clearable
          @update:value="handleSelectChange"
        />
      </template>

      <template v-else-if="inputType === 'array'">
        <NInput
          :value="arrayValue"
          placeholder="Comma-separated values"
          :disabled="disabled"
          @update:value="handleArrayChange"
        />
      </template>

      <template v-else>
        <NInput
          :value="value ? JSON.stringify(value) : ''"
          placeholder="JSON object"
          :disabled="disabled"
          @update:value="(v) => emit('update:value', v ? JSON.parse(v) : null)"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.auto-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auto-field-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.auto-field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color);
}

.auto-field-key {
  font-size: 11px;
  color: var(--n-text-color-disabled);
  font-weight: 400;
}

.auto-field-info {
  color: var(--n-text-color-disabled);
  cursor: help;
}

.auto-field-control {
  width: 100%;
}
</style>
