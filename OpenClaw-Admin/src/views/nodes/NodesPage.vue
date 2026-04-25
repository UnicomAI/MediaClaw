<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  NCard,
  NGrid,
  NGridItem,
  NButton,
  NSpace,
  NTag,
  NText,
  NIcon,
  NSpin,
  NModal,
  NInput,
  useMessage,
} from 'naive-ui'
import { RefreshOutline, CheckmarkOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useNodeStore } from '@/stores/node'
import { formatRelativeTime } from '@/utils/format'
import type { DeviceNode } from '@/api/types'

const nodeStore = useNodeStore()
const message = useMessage()
const { t } = useI18n()

const showPairModal = ref(false)
const pairNodeId = ref('')
const pairCode = ref('')

onMounted(() => {
  nodeStore.fetchNodes()
})

function platformIcon(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'macos': return '🖥️'
    case 'ios': return '📱'
    case 'android': return '🤖'
    case 'linux': return '🐧'
    case 'windows': return '💻'
    default: return '📟'
  }
}

function startPairing(node: DeviceNode) {
  pairNodeId.value = node.id
  pairCode.value = ''
  showPairModal.value = true
}

async function confirmPairing() {
  if (!pairCode.value.trim()) {
    message.warning(t('pages.nodes.pairCodeRequired'))
    return
  }
  try {
    await nodeStore.approvePairing(pairNodeId.value, pairCode.value)
    message.success(t('pages.nodes.pairSuccess'))
    showPairModal.value = false
  } catch {
    message.error(t('pages.nodes.pairFailed'))
  }
}
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :title="t('pages.nodes.title')" class="app-card">
      <template #header-extra>
        <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" @click="nodeStore.fetchNodes()">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          {{ t('common.refresh') }}
        </NButton>
      </template>

      <NSpin :show="nodeStore.loading">
        <NGrid cols="1 s:2 m:3" responsive="screen" :x-gap="16" :y-gap="16">
          <NGridItem v-for="node in nodeStore.nodes" :key="node.id">
            <NCard :bordered="true" style="border-radius: var(--radius);" hoverable>
              <NSpace vertical :size="10">
                <NSpace justify="space-between" align="center">
                  <NSpace align="center" :size="8">
                    <span style="font-size: 24px;">{{ platformIcon(node.platform) }}</span>
                    <div>
                      <NText strong>{{ node.name }}</NText>
                      <NText depth="3" style="font-size: 12px; display: block;">
                        {{ node.platform }}
                      </NText>
                    </div>
                  </NSpace>
                  <NTag :type="node.connected ? 'success' : 'default'" size="small" round :bordered="false">
                    {{ node.connected ? t('common.online') : t('common.offline') }}
                  </NTag>
                </NSpace>

                <NSpace v-if="node.capabilities.length" :size="4" style="flex-wrap: wrap;">
                  <NTag
                    v-for="cap in node.capabilities.slice(0, 5)"
                    :key="cap"
                    size="tiny"
                    :bordered="false"
                    round
                  >
                    {{ cap }}
                  </NTag>
                  <NTag v-if="node.capabilities.length > 5" size="tiny" :bordered="false" round>
                    +{{ node.capabilities.length - 5 }}
                  </NTag>
                </NSpace>

                <NSpace justify="space-between" align="center">
                  <NText v-if="node.lastSeen" depth="3" style="font-size: 12px;">
                    {{ formatRelativeTime(node.lastSeen) }}
                  </NText>
                  <NButton
                    v-if="!node.connected"
                    size="small"
                    type="primary"
                    @click="startPairing(node)"
                  >
                    <template #icon><NIcon :component="CheckmarkOutline" /></template>
                    {{ t('pages.nodes.pair') }}
                  </NButton>
                </NSpace>
              </NSpace>
            </NCard>
          </NGridItem>
        </NGrid>

        <div
          v-if="!nodeStore.loading && nodeStore.nodes.length === 0"
          style="text-align: center; padding: 60px 0; color: var(--text-secondary);"
        >
          {{ t('pages.nodes.empty') }}
        </div>
      </NSpin>
    </NCard>

    <NModal
      v-model:show="showPairModal"
      preset="dialog"
      :title="t('pages.nodes.pairDialogTitle')"
      :positive-text="t('pages.nodes.confirmPair')"
      :negative-text="t('common.cancel')"
      @positive-click="confirmPairing"
    >
      <NSpace vertical :size="12" style="margin-top: 16px;">
        <NText>{{ t('pages.nodes.pairPrompt') }}</NText>
        <NInput
          v-model:value="pairCode"
          :placeholder="t('pages.nodes.pairCodePlaceholder')"
          @keydown.enter="confirmPairing"
        />
      </NSpace>
    </NModal>
  </NSpace>
</template>
