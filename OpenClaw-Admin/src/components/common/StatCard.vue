<script setup lang="ts">
import { NCard, NStatistic, NIcon } from 'naive-ui'

defineProps<{
  title: string
  value: number | string
  icon: unknown
  color?: string
}>()
</script>

<template>
  <NCard :bordered="true" style="border-radius: var(--radius-lg);">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <NStatistic :label="title" :value="value" />
      <div
        style="width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"
        :style="{ backgroundColor: (color || '#18a058') + '15', color: color || '#18a058' }"
      >
        <NIcon :size="22" :component="icon as any" />
      </div>
    </div>
  </NCard>
</template>
