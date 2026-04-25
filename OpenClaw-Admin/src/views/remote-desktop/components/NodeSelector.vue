<script setup lang="ts">
import { computed } from 'vue'
import { NSelect, NSpace, NTag, NIcon } from 'naive-ui'
import { DesktopOutline } from '@vicons/ionicons5'
import type { RemoteDesktopNode } from '@/api/types'
import { useI18n } from 'vue-i18n'

interface Props {
  nodes: RemoteDesktopNode[]
  modelValue?: string
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  'update:modelValue': [nodeId: string | undefined]
  'node-select': [node: RemoteDesktopNode]
}>()

const { t } = useI18n()

const nodeOptions = computed(() => {
  return props.nodes.map((node) => ({
    label: node.name,
    value: node.id,
    node,
  }))
})

function getPlatformLabel(platform: string): string {
  const platformMap: Record<string, string> = {
    linux: t('pages.remoteDesktop.platform.linux'),
    windows: t('pages.remoteDesktop.platform.windows'),
    unknown: t('pages.remoteDesktop.platform.unknown'),
  }
  return platformMap[platform] || platform
}

function handleSelect(value: string) {
  emit('update:modelValue', value)
  const selectedNode = props.nodes.find((n) => n.id === value)
  if (selectedNode) {
    emit('node-select', selectedNode)
  }
}

function handleClear() {
  emit('update:modelValue', undefined)
}

function renderLabel(option: { label: string; value: string; node: RemoteDesktopNode }) {
  const tags = [
    h(NTag, {
      size: 'small',
      bordered: false,
      type: option.node.connected ? 'success' : 'default',
    }, { default: () => getPlatformLabel(option.node.platform) }),
  ]
  
  if (option.node.hasDesktop) {
    tags.push(h(NTag, {
      size: 'small',
      bordered: false,
      type: 'info',
    }, { default: () => 'Desktop' }))
  }
  
  return h('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
  }, [
    h(NIcon, { component: DesktopOutline, size: 18 }),
    h('span', option.label),
    ...tags,
  ])
}

import { h } from 'vue'
</script>

<template>
  <NSelect
    :value="modelValue"
    :options="nodeOptions"
    :loading="loading"
    :placeholder="$t('pages.remoteDesktop.settings.nodePlaceholder')"
    clearable
    filterable
    :render-label="renderLabel"
    @update:value="handleSelect"
    @clear="handleClear"
  />
</template>
