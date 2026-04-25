<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { NTag, NSpace, NButton, NSelect, NPopover } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useWebSocketStore } from '@/stores/websocket'
import { useHermesConnectionStore } from '@/stores/hermes/connection'
import { ConnectionState } from '@/api/types'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faGithub } from '@fortawesome/free-brands-svg-icons'

const message = useMessage()

const wsStore = useWebSocketStore()
const hermesConnStore = useHermesConnectionStore()
const { t } = useI18n()
const isUpdating = ref(false)
const selectedVersion = ref('')
const versionOptions = ref<Array<{ label: string; value: string }>>([])
const isLoadingVersions = ref(false)
const latestVersion = ref<string | null>(null)

const isHermes = computed(() => hermesConnStore.currentGateway === 'hermes')

const status = computed(() => {
  if (isHermes.value) {
    if (hermesConnStore.hermesConnected) {
      return { label: t('components.connectionStatus.connected'), type: 'success' as const }
    }
    if (hermesConnStore.hermesConnecting) {
      return { label: t('components.connectionStatus.connecting'), type: 'info' as const }
    }
    return { label: t('components.connectionStatus.disconnected'), type: 'error' as const }
  }
  switch (wsStore.state) {
    case ConnectionState.CONNECTED:
      return { label: t('components.connectionStatus.connected'), type: 'success' as const }
    case ConnectionState.CONNECTING:
      return { label: t('components.connectionStatus.connecting'), type: 'info' as const }
    case ConnectionState.RECONNECTING:
      return { label: t('components.connectionStatus.reconnecting'), type: 'warning' as const }
    case ConnectionState.FAILED:
      return { label: t('components.connectionStatus.failed'), type: 'error' as const }
    case ConnectionState.DISCONNECTED:
    default:
      return { label: t('components.connectionStatus.disconnected'), type: 'error' as const }
  }
})

const hasUpdate = computed(() => {
  // 比较当前版本和从npm获取的最新版本
  if (wsStore.gatewayVersion && latestVersion.value) {
    return wsStore.gatewayVersion !== latestVersion.value
  }
  return false
})

const displayLatestVersion = computed(() => {
  return latestVersion.value
})

// 从服务器 API 获取版本列表
async function fetchNpmVersions() {
  isLoadingVersions.value = true
  try {
    console.log('[ConnectionStatus] Fetching npm versions...')
    const response = await fetch('/api/npm/versions')
    if (!response.ok) {
      throw new Error('Failed to fetch versions from server')
    }
    const data = await response.json()
    const versions = data.versions || []
    console.log('[ConnectionStatus] Fetched versions:', versions.slice(0, 5))
    
    if (versions.length > 0) {
      latestVersion.value = versions[0]
      console.log('[ConnectionStatus] Latest version:', latestVersion.value)
      
      versionOptions.value = versions.map((version: string) => ({
        label: version,
        value: version
      }))
      
      selectedVersion.value = versions[0]
    } else {
      // 如果没有获取到版本列表，使用当前网关版本
      if (wsStore.gatewayVersion) {
        versionOptions.value = [
          { label: wsStore.gatewayVersion, value: wsStore.gatewayVersion }
        ]
        selectedVersion.value = wsStore.gatewayVersion
      }
    }
  } catch (error) {
    console.error('[ConnectionStatus] Failed to fetch npm versions:', error)
    message.warning(t('components.connectionStatus.fetchVersionsFailed'))
    // 即使获取失败，也不使用 Gateway 提供的版本信息，保持 latestVersion 为 null
    if (wsStore.gatewayVersion) {
      versionOptions.value = [
        { label: wsStore.gatewayVersion, value: wsStore.gatewayVersion }
      ]
      selectedVersion.value = wsStore.gatewayVersion
    }
  } finally {
    isLoadingVersions.value = false
  }
}

// 当连接状态或更新信息变化时，获取版本列表
const updateVersionOptions = async () => {
  if (wsStore.state === ConnectionState.CONNECTED) {
    await fetchNpmVersions()
  }
}

// 监听连接状态和更新信息变化
onMounted(async () => {
  await updateVersionOptions()
  
  // 监听WebSocket状态变化
  const unsubscribe = wsStore.subscribe('connected', async () => {
    await updateVersionOptions()
  })
  
  return () => {
    unsubscribe()
  }
})

async function handleUpdate(version?: string) {
  isUpdating.value = true
  try {
    message.info(t('components.connectionStatus.updatingMessage'))
    
    const response = await fetch('/api/npm/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version }),
    })
    
    const result = await response.json()
    console.log('[ConnectionStatus] npm update result:', result)
    
    if (result.ok) {
      message.success(t('components.connectionStatus.updateSuccessManual', { message: result.message || '' }))
    } else {
      const errorMsg = result.error || result.stderr || t('components.connectionStatus.unknownError')
      console.error('[ConnectionStatus] Update failed:', result)
      message.error(t('components.connectionStatus.updateFailed', { error: errorMsg }))
    }
  } catch (err) {
    console.error('Update failed:', err)
    message.error(t('components.connectionStatus.updateFailed', { error: err instanceof Error ? err.message : t('components.connectionStatus.unknownError') }))
  } finally {
    isUpdating.value = false
  }
}

function handleCustomUpdate() {
  if (selectedVersion.value) {
    handleUpdate(selectedVersion.value)
  } else {
    message.warning(t('components.connectionStatus.pleaseSelectVersion'))
  }
}
</script>

<template>
  <NSpace :size="8" align="center">
    <a
      href="https://github.com/joelulu/mediaclaw-plugin"
      target="_blank"
      rel="noopener noreferrer"
      style="display: flex; align-items: center; color: inherit; text-decoration: none;"
    >
      <FontAwesomeIcon :icon="faGithub" style="font-size: 16px;" />
    </a>
    <NTag
      v-if="wsStore.gatewayVersion"
      size="small"
      :bordered="false"
      round
    >
      OpenClaw {{ wsStore.gatewayVersion }}
    </NTag>
    <NPopover 
      v-if="hasUpdate && wsStore.state === ConnectionState.CONNECTED && displayLatestVersion"
      trigger="click" 
      placement="bottom" 
      :width="280"
    >
      <template #trigger>
        <NButton
          size="small"
          type="primary"
          text
          :loading="isUpdating"
          :disabled="isUpdating"
        >
          {{ isUpdating ? t('components.connectionStatus.updating') : t('components.connectionStatus.newVersionAvailable', { version: displayLatestVersion }) }}
        </NButton>
      </template>
      <div style="padding: 12px;">
        <div style="margin-bottom: 8px;">{{ t('components.connectionStatus.upgradeToVersion') }}</div>
        <NSpace align="center">
          <NSelect
            v-model:value="selectedVersion"
            :options="versionOptions"
            :placeholder="t('components.connectionStatus.selectVersion')"
            size="small"
            style="width: 180px;"
            :disabled="isUpdating || isLoadingVersions"
            :loading="isLoadingVersions"
          />
          <NButton
            size="small"
            @click="handleCustomUpdate"
            :loading="isUpdating"
            :disabled="isUpdating || !selectedVersion || isLoadingVersions"
          >
            {{ t('components.connectionStatus.upgrade') }}
          </NButton>
        </NSpace>
      </div>
    </NPopover>
    <NTag
      :type="status.type"
      round
      size="small"
      :bordered="false"
    >
      <template #icon>
        <span
          style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px;"
          :style="{
            backgroundColor: status.type === 'success' ? '#18a058' : status.type === 'warning' ? '#f0a020' : status.type === 'error' ? '#d03050' : '#2080f0'
          }"
        />
      </template>
      {{ status.label }}
    </NTag>
  </NSpace>
</template>
