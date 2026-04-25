<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NSpace,
  NButton,
  NIcon,
  NTabs,
  NTabPane,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NDynamicTags,
  NSpin,
  NAlert,
  NCode,
  NScrollbar,
  useMessage,
} from 'naive-ui'
import { GitNetworkOutline, RefreshOutline, SaveOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '@/stores/config'
import type { ConfigPatch } from '@/api/types'

const configStore = useConfigStore()
const message = useMessage()
const router = useRouter()
const { t } = useI18n()
const activeTab = ref('general')
const rawJsonEdit = ref('')

onMounted(() => {
  configStore.fetchConfig()
})

watch(
  () => configStore.config,
  (config) => {
    if (config) {
      rawJsonEdit.value = JSON.stringify(config, null, 2)
    }
  },
  { immediate: true }
)

// -- General settings --
const primaryModel = ref('')
const gatewayPort = ref(18789)
const workspace = ref('')

watch(
  () => configStore.config,
  (config) => {
    if (!config) return
    primaryModel.value = config.models?.primary || config.agents?.defaults?.model?.primary || ''
    gatewayPort.value = config.gateway?.port || 18789
    workspace.value = config.agents?.defaults?.workspace || '~/.openclaw/workspace'
  },
  { immediate: true }
)

async function saveGeneralSettings() {
  const patches: ConfigPatch[] = []
  if (primaryModel.value) {
    patches.push({ path: 'agents.defaults.model.primary', value: primaryModel.value })
  }
  if (gatewayPort.value) {
    patches.push({ path: 'gateway.port', value: gatewayPort.value })
  }
  if (workspace.value) {
    patches.push({ path: 'agents.defaults.workspace', value: workspace.value })
  }

  if (patches.length === 0) {
    message.info(t('pages.config.noChanges'))
    return
  }

  try {
    await configStore.patchConfig(patches)
    message.success(t('pages.config.saved'))
  } catch {
    message.error(t('common.saveFailed'))
  }
}

// -- Tools settings --
const toolProfile = ref('full')
const allowedTools = ref<string[]>([])
const deniedTools = ref<string[]>([])

watch(
  () => configStore.config,
  (config) => {
    if (!config) return
    toolProfile.value = config.tools?.profile || config.agents?.defaults?.tools?.profile || 'full'
    allowedTools.value = config.tools?.allow || config.agents?.defaults?.tools?.allow || []
    deniedTools.value = config.tools?.deny || config.agents?.defaults?.tools?.deny || []
  },
  { immediate: true }
)

async function saveToolSettings() {
  const patches: ConfigPatch[] = [
    { path: 'tools.profile', value: toolProfile.value },
    { path: 'tools.allow', value: allowedTools.value },
    { path: 'tools.deny', value: deniedTools.value },
  ]

  try {
    await configStore.patchConfig(patches)
    message.success(t('pages.config.toolsSaved'))
  } catch {
    message.error(t('common.saveFailed'))
  }
}

// -- Session settings --
const sessionResetMode = ref('off')
const sessionResetHour = ref(6)
const sessionIdleMinutes = ref(30)
const queueMode = ref('sequential')

watch(
  () => configStore.config,
  (config) => {
    if (!config) return
    sessionResetMode.value = config.session?.reset?.mode || 'off'
    sessionResetHour.value = config.session?.reset?.hour ?? 6
    sessionIdleMinutes.value = config.session?.reset?.idleMinutes ?? 30
    queueMode.value = config.session?.queue?.mode || 'sequential'
  },
  { immediate: true }
)

async function saveSessionSettings() {
  const patches: ConfigPatch[] = [
    { path: 'session.reset.mode', value: sessionResetMode.value },
    { path: 'session.queue.mode', value: queueMode.value },
  ]
  if (sessionResetMode.value === 'daily') {
    patches.push({ path: 'session.reset.hour', value: sessionResetHour.value })
  }
  if (sessionResetMode.value === 'idle') {
    patches.push({ path: 'session.reset.idleMinutes', value: sessionIdleMinutes.value })
  }

  try {
    await configStore.patchConfig(patches)
    message.success(t('pages.config.sessionsSaved'))
  } catch {
    message.error(t('common.saveFailed'))
  }
}

async function handleApply() {
  try {
    await configStore.applyConfig()
    message.success(t('pages.config.appliedAndReloading'))
  } catch {
    message.error(t('pages.config.applyFailed'))
  }
}

const modelOptions = [
  { label: 'Claude Sonnet 4.5', value: 'anthropic/claude-sonnet-4-5' },
  { label: 'Claude Opus 4', value: 'anthropic/claude-opus-4' },
  { label: 'Claude Haiku 3.5', value: 'anthropic/claude-haiku-3-5' },
  { label: 'GPT-4o', value: 'openai/gpt-4o' },
  { label: 'GPT-4o Mini', value: 'openai/gpt-4o-mini' },
]

const profileOptions = computed(() => ([
  { label: t('pages.config.toolProfiles.minimal'), value: 'minimal' },
  { label: t('pages.config.toolProfiles.coding'), value: 'coding' },
  { label: t('pages.config.toolProfiles.full'), value: 'full' },
]))

const resetModeOptions = computed(() => ([
  { label: t('pages.config.resetModes.off'), value: 'off' },
  { label: t('pages.config.resetModes.daily'), value: 'daily' },
  { label: t('pages.config.resetModes.idle'), value: 'idle' },
]))

const queueModeOptions = computed(() => ([
  { label: t('pages.config.queueModes.sequential'), value: 'sequential' },
  { label: t('pages.config.queueModes.concurrent'), value: 'concurrent' },
  { label: t('pages.config.queueModes.collect'), value: 'collect' },
]))

function goToChannels() {
  router.push({ name: 'Channels' })
}
</script>

<template>
  <NSpin :show="configStore.loading">
    <NSpace vertical :size="16">
      <NCard :title="t('pages.config.title')" class="app-card">
        <template #header-extra>
          <NSpace :size="8" class="app-toolbar">
            <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" @click="configStore.fetchConfig()">
              <template #icon><NIcon :component="RefreshOutline" /></template>
              {{ t('common.refresh') }}
            </NButton>
            <NButton size="small" type="warning" class="app-toolbar-btn app-toolbar-btn--apply" @click="handleApply">
              {{ t('pages.config.applyAndReload') }}
            </NButton>
          </NSpace>
        </template>

        <NAlert type="info" :bordered="false" style="margin-top: 12px;">
          <NSpace justify="space-between" align="center">
            <span>{{ t('pages.config.channelsMigratedHint') }}</span>
            <NButton size="tiny" type="primary" ghost @click="goToChannels">
              <template #icon><NIcon :component="GitNetworkOutline" /></template>
              {{ t('pages.config.goToChannels') }}
            </NButton>
          </NSpace>
        </NAlert>

        <NTabs v-model:value="activeTab" type="line" animated>

          <!-- General -->
          <NTabPane name="general" :tab="t('pages.config.tabs.general')">
            <NForm label-placement="left" label-width="120" style="max-width: 600px; margin-top: 16px;">
              <NFormItem :label="t('pages.config.labels.primaryModel')">
                <NSelect
                  v-model:value="primaryModel"
                  :options="modelOptions"
                  filterable
                  tag
                  :placeholder="t('pages.config.placeholders.model')"
                />
              </NFormItem>
              <NFormItem :label="t('pages.config.labels.gatewayPort')">
                <NInputNumber v-model:value="gatewayPort" :min="1" :max="65535" />
              </NFormItem>
              <NFormItem :label="t('pages.config.labels.workspacePath')">
                <NInput v-model:value="workspace" :placeholder="t('pages.config.placeholders.workspacePath')" />
              </NFormItem>
              <NFormItem>
                <NButton type="primary" @click="saveGeneralSettings" :loading="configStore.saving">
                  <template #icon><NIcon :component="SaveOutline" /></template>
                  {{ t('common.save') }}
                </NButton>
              </NFormItem>
            </NForm>
          </NTabPane>

          <!-- Tools -->
          <NTabPane name="tools" :tab="t('pages.config.tabs.tools')">
            <NForm label-placement="left" label-width="120" style="max-width: 600px; margin-top: 16px;">
              <NFormItem :label="t('pages.config.labels.toolProfile')">
                <NSelect v-model:value="toolProfile" :options="profileOptions" />
              </NFormItem>
              <NFormItem :label="t('pages.config.labels.allowedTools')">
                <NDynamicTags v-model:value="allowedTools" />
              </NFormItem>
              <NFormItem :label="t('pages.config.labels.deniedTools')">
                <NDynamicTags v-model:value="deniedTools" />
              </NFormItem>
              <NFormItem>
                <NButton type="primary" @click="saveToolSettings" :loading="configStore.saving">
                  <template #icon><NIcon :component="SaveOutline" /></template>
                  {{ t('common.save') }}
                </NButton>
              </NFormItem>
            </NForm>
          </NTabPane>

          <!-- Sessions -->
          <NTabPane name="sessions" :tab="t('pages.config.tabs.sessions')">
            <NForm label-placement="left" label-width="120" style="max-width: 600px; margin-top: 16px;">
              <NFormItem :label="t('pages.config.labels.resetMode')">
                <NSelect v-model:value="sessionResetMode" :options="resetModeOptions" />
              </NFormItem>
              <NFormItem v-if="sessionResetMode === 'daily'" :label="t('pages.config.labels.resetHourUtc')">
                <NInputNumber v-model:value="sessionResetHour" :min="0" :max="23" />
              </NFormItem>
              <NFormItem v-if="sessionResetMode === 'idle'" :label="t('pages.config.labels.idleMinutes')">
                <NInputNumber v-model:value="sessionIdleMinutes" :min="1" :max="1440" />
              </NFormItem>
              <NFormItem :label="t('pages.config.labels.queueMode')">
                <NSelect v-model:value="queueMode" :options="queueModeOptions" />
              </NFormItem>
              <NFormItem>
                <NButton type="primary" @click="saveSessionSettings" :loading="configStore.saving">
                  <template #icon><NIcon :component="SaveOutline" /></template>
                  {{ t('common.save') }}
                </NButton>
              </NFormItem>
            </NForm>
          </NTabPane>

          <!-- Raw JSON -->
          <NTabPane name="raw" :tab="t('pages.config.tabs.raw')">
            <NAlert type="info" :bordered="false" style="margin: 16px 0 12px;">
              {{ t('pages.config.rawReadonlyHint') }}
            </NAlert>
            <NScrollbar style="max-height: 500px;">
              <NCode :code="rawJsonEdit" language="json" style="font-size: 13px;" />
            </NScrollbar>
          </NTabPane>
        </NTabs>
      </NCard>
    </NSpace>
  </NSpin>
</template>
