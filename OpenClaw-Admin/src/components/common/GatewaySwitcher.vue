<script setup lang="ts">
import { h } from 'vue'
import { NSelect, NSpace } from 'naive-ui'
import { useHermesConnectionStore } from '@/stores/hermes/connection'

const connStore = useHermesConnectionStore()

const gatewayLogos: Record<string, string> = {
  openclaw: '🦞',
  hermes: '⚡',
}

const options = [
  { label: 'OpenClaw', value: 'openclaw' },
  { label: 'Hermes', value: 'hermes' },
]

function renderLabel(option: { label: string; value: string }) {
  const logo = gatewayLogos[option.value] || '🔌'
  return h('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
    h('span', { style: { fontSize: '16px' } }, logo),
    h('span', {}, option.label),
  ])
}

async function handleChange(val: string) {
  await connStore.switchGateway(val as 'openclaw' | 'hermes')
}
</script>

<template>
  <NSpace align="center" :size="8">
    <NSelect
      :value="connStore.currentGateway"
      :options="options"
      :render-label="renderLabel"
      size="small"
      style="width: 140px"
      @update:value="handleChange"
    />
  </NSpace>
</template>
