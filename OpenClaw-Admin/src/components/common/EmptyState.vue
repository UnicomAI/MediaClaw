<script setup lang="ts">
import { NEmpty } from 'naive-ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  description?: string
}>()

const { t } = useI18n()
</script>

<template>
  <div style="display: flex; justify-content: center; align-items: center; padding: 60px 0;">
    <NEmpty :description="description || t('common.empty')">
      <template v-if="$slots.extra" #extra>
        <slot name="extra" />
      </template>
    </NEmpty>
  </div>
</template>
