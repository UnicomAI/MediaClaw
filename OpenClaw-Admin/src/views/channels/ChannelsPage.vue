<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputGroup,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import {
  AddOutline,
  PlayOutline,
  RefreshOutline,
  SaveOutline,
} from '@vicons/ionicons5'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faQq } from '@fortawesome/free-brands-svg-icons'
import { useI18n } from 'vue-i18n'
import {
  faCircleCheck,
  faBuilding,
  faComments,
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons'
import { useChannelManagementStore } from '@/stores/channel-management'
import {
  collectSecretFieldKeys,
  resolveChannelTemplate,
} from '@/utils/channel-config'
import { maskSecretValue } from '@/utils/secret-mask'

interface ChinaChannelMeta {
  key: 'qqbot' | 'feishu' | 'dingtalk' | 'wecom'
  icon: IconDefinition
  pluginPackages: string[]
  pluginIds: string[]
  guideUrl: string
}

interface ChannelCard extends ChinaChannelMeta {
  channelKey: string
  label: string
  description: string
  pluginStatusKnown: boolean
  pluginInstalled: boolean
  configured: boolean
  visibleSecretKeys: string[]
}

const CHINA_CHANNELS: ChinaChannelMeta[] = [
  {
    key: 'qqbot',
    icon: faQq,
    pluginPackages: ['@openclaw-china/qqbot'],
    pluginIds: ['qqbot'],
    guideUrl: 'https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/qqbot/configuration.md',
  },
  {
    key: 'feishu',
    icon: faPaperPlane,
    pluginPackages: ['@openclaw-china/feishu-china', '@openclaw/feishu'],
    pluginIds: ['feishu', 'feishu-china'],
    guideUrl: 'https://github.com/openclaw/openclaw/blob/main/docs/zh-CN/channels/feishu.md',
  },
  {
    key: 'dingtalk',
    icon: faComments,
    pluginPackages: ['@openclaw-china/dingtalk'],
    pluginIds: ['dingtalk'],
    guideUrl: 'https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/dingtalk/configuration.md',
  },
  {
    key: 'wecom',
    icon: faBuilding,
    pluginPackages: ['@openclaw-china/wecom', '@openclaw-china/wecom-app'],
    pluginIds: ['wecom', 'wecom-app'],
    guideUrl: 'https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/wecom/configuration.md',
  },
]

const channelStore = useChannelManagementStore()
const message = useMessage()
const { t } = useI18n()

const expandedChannelKeys = ref<string[]>([])
const installLoading = ref<Record<string, boolean>>({})

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function shouldKeepStringValue(raw: string): string | undefined {
  const normalized = raw.trim()
  return normalized ? normalized : undefined
}

function pluginStatusType(card: { pluginStatusKnown: boolean; pluginInstalled: boolean }): 'success' | 'warning' | 'default' {
  if (card.pluginStatusKnown) {
    return card.pluginInstalled ? 'success' : 'default'
  }
  return card.pluginInstalled ? 'success' : 'warning'
}

function pluginStatusLabel(card: { pluginStatusKnown: boolean; pluginInstalled: boolean }): string {
  if (card.pluginStatusKnown) {
    return card.pluginInstalled ? t('pages.channels.pluginStatus.installed') : t('pages.channels.pluginStatus.notInstalled')
  }
  return card.pluginInstalled ? t('pages.channels.pluginStatus.assumedInstalled') : t('pages.channels.pluginStatus.unknown')
}

function resolveManagedChannelKey(focusKey: ChinaChannelMeta['key']): string {
  const draftKey = Object.keys(channelStore.channelsDraft).find(
    (key) => resolveChannelTemplate(key)?.key === focusKey
  )
  if (draftKey) return draftKey

  const runtimeKey = Object.keys(channelStore.runtimeByChannel).find(
    (key) => resolveChannelTemplate(key)?.key === focusKey
  )
  if (runtimeKey) return runtimeKey

  return focusKey
}

function readChannelConfig(channelKey: string): Record<string, unknown> {
  return asRecord(channelStore.channelsDraft[channelKey])
}

const channelCards = computed(() => {
  const installStatusKnown = channelStore.pluginRpcSupported || channelStore.runtimeChannels.length > 0

  return CHINA_CHANNELS.map((meta) => {
    const label = t(`pages.channels.channels.${meta.key}.label`)
    const description = t(`pages.channels.channels.${meta.key}.description`)
    const channelKey = resolveManagedChannelKey(meta.key)
    const pluginInstalled = channelStore.isPluginInstalled(meta.pluginPackages, {
      channelKey,
      pluginIds: meta.pluginIds,
    })
    const configured = !!channelStore.channelsDraft[channelKey]
    const channelConfig = configured ? readChannelConfig(channelKey) : {}
    const template = resolveChannelTemplate(meta.key)
    const detectedSecretKeys = collectSecretFieldKeys(channelConfig, template?.channelSecretFields || [])
    const visibleSecretKeys =
      meta.key === 'qqbot' || meta.key === 'dingtalk'
        ? ['clientSecret']
        : detectedSecretKeys

    return {
      ...meta,
      label,
      description,
      channelKey,
      pluginStatusKnown: installStatusKnown,
      pluginInstalled,
      configured,
      visibleSecretKeys,
    }
  })
})

function channelEnabled(channelKey: string): boolean {
  const config = readChannelConfig(channelKey)
  return typeof config.enabled === 'boolean' ? config.enabled : true
}

function updateChannelEnabled(channelKey: string, value: boolean): void {
  channelStore.setChannelField(channelKey, 'enabled', value)
}

function channelAppId(channelKey: string): string {
  return readString(readChannelConfig(channelKey).appId)
}

function updateChannelAppId(channelKey: string, value: string): void {
  channelStore.setChannelField(channelKey, 'appId', shouldKeepStringValue(value))
}

function channelClientId(channelKey: string): string {
  return readString(readChannelConfig(channelKey).clientId)
}

function updateChannelClientId(channelKey: string, value: string): void {
  channelStore.setChannelField(channelKey, 'clientId', shouldKeepStringValue(value))
}

function channelMarkdownSupport(channelKey: string): boolean {
  return readBoolean(readChannelConfig(channelKey).markdownSupport, true)
}

function updateChannelMarkdownSupport(channelKey: string, value: boolean): void {
  channelStore.setChannelField(channelKey, 'markdownSupport', value)
}

function channelSecretValue(channelKey: string, field: string): string {
  const row = readChannelConfig(channelKey)
  return maskSecretValue(row[field])
}

function readSecretInput(channelKey: string, field: string): string {
  return channelStore.getSecretUpdate({ channelKey, field })
}

function updateSecretInput(channelKey: string, field: string, value: string): void {
  channelStore.setSecretUpdate({ channelKey, field }, value)
}

function hasSecretUpdate(channelKey: string, field: string): boolean {
  return channelStore.hasSecretUpdate({ channelKey, field })
}

function refreshExpandedPanels(): void {
  expandedChannelKeys.value = channelCards.value.map((card) => card.channelKey)
}

function buildPluginInstallCommands(pluginPackages: string[]): string[] {
  return pluginPackages.map((pluginPackage) => `openclaw plugins install ${pluginPackage}`)
}

async function installChannel(meta: ChannelCard): Promise<void> {
  const channelKey = meta.channelKey || resolveManagedChannelKey(meta.key)
  installLoading.value[channelKey] = true
  try {
    let installedPluginName = ''
    if (!channelStore.isPluginInstalled(meta.pluginPackages, { channelKey, pluginIds: meta.pluginIds })) {
      installedPluginName = await channelStore.installChannelPlugin(meta.pluginPackages)
    }

    channelStore.ensureDraftChannel(channelKey)
    channelStore.setChannelField(channelKey, 'enabled', true)
    if (meta.key === 'qqbot') {
      channelStore.setChannelField(channelKey, 'markdownSupport', true)
    }
    refreshExpandedPanels()

    if (installedPluginName) {
      message.success(t('pages.channels.installSuccessWithPlugin', { channel: meta.label || meta.key, plugin: installedPluginName }))
    } else {
      message.success(t('pages.channels.installSuccess', { channel: meta.label || meta.key }))
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : t('pages.channels.installFailed')
    if (/unknown method/i.test(errorMessage) || /method not found/i.test(errorMessage)) {
      message.error(t('pages.channels.remoteInstallUnsupported', { channel: meta.label || meta.key }))
    } else {
      message.error(t('pages.channels.remoteInstallFailed', { channel: meta.label || meta.key, error: errorMessage }))
    }
  } finally {
    installLoading.value[channelKey] = false
  }
}

async function handleRefresh(): Promise<void> {
  try {
    await channelStore.refreshAll()
    refreshExpandedPanels()
  } catch {
    message.error(t('pages.channels.refreshFailed'))
  }
}

async function handleSave(applyAfterSave = false): Promise<void> {
  try {
    const patches = await channelStore.saveChannels({ apply: applyAfterSave })
    if (patches.length === 0) {
      message.info(t('pages.channels.noChanges'))
      return
    }
    message.success(applyAfterSave ? t('pages.channels.savedAndApplied') : t('pages.channels.saved'))
  } catch {
    message.error(applyAfterSave ? t('pages.channels.saveAndApplyFailed') : t('common.saveFailed'))
  }
}

onMounted(() => {
  handleRefresh()
})
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :title="t('pages.channels.title')" class="channel-root-card">
      <template #header-extra>
        <NSpace :size="10" class="toolbar-actions">
          <NButton size="small" class="toolbar-btn toolbar-btn--refresh" @click="handleRefresh">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('common.refresh') }}
          </NButton>
          <NButton
            size="small"
            type="primary"
            class="toolbar-btn toolbar-btn--save"
            :loading="channelStore.saving"
            :disabled="channelStore.applying"
            @click="handleSave(false)"
          >
            <template #icon><NIcon :component="SaveOutline" /></template>
            {{ t('common.save') }}
          </NButton>
          <NButton
            size="small"
            type="warning"
            class="toolbar-btn toolbar-btn--apply"
            :loading="channelStore.saving || channelStore.applying"
            @click="handleSave(true)"
          >
            <template #icon><NIcon :component="PlayOutline" /></template>
            {{ t('common.saveAndApply') }}
          </NButton>
        </NSpace>
      </template>

      <NSpace vertical :size="10">
        <div class="thanks-panel">
          <div class="thanks-title-row">
            <span class="thanks-icon">
              <FontAwesomeIcon :icon="faCircleCheck" />
            </span>
            <span>
              {{ t('pages.channels.thanks.prefix') }}
              <a
                href="https://github.com/BytePioneer-AI/openclaw-china"
                target="_blank"
                rel="noopener noreferrer"
                class="banner-link"
              >
                openclaw-china
              </a>
              {{ t('pages.channels.thanks.suffix') }}
            </span>
          </div>
          <span class="guide-pill-row">
            <a class="guide-pill" href="https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/qqbot/configuration.md" target="_blank" rel="noopener noreferrer">{{ t('pages.channels.guides.qqbot') }}</a>
            <a class="guide-pill" href="https://github.com/openclaw/openclaw/blob/main/docs/zh-CN/channels/feishu.md" target="_blank" rel="noopener noreferrer">{{ t('pages.channels.guides.feishu') }}</a>
            <a class="guide-pill" href="https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/dingtalk/configuration.md" target="_blank" rel="noopener noreferrer">{{ t('pages.channels.guides.dingtalk') }}</a>
            <a class="guide-pill" href="https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/wecom/configuration.md" target="_blank" rel="noopener noreferrer">{{ t('pages.channels.guides.wecom') }}</a>
          </span>
        </div>

        <NAlert v-if="channelStore.lastError" type="error" :bordered="false">
          {{ channelStore.lastError }}
        </NAlert>

        <NSpin :show="channelStore.loading || channelStore.applying">
          <NCollapse v-model:expanded-names="expandedChannelKeys">
            <NCollapseItem
              v-for="card in channelCards"
              :key="card.channelKey"
              :name="card.channelKey"
            >
              <template #header>
                <NSpace align="center" :size="8" class="channel-header-row">
                  <span class="channel-brand" :class="`channel-brand--${card.key}`">
                    <FontAwesomeIcon :icon="card.icon" />
                  </span>
                  <NText strong>{{ card.label }}</NText>
                  <NText depth="3" class="channel-key-text">{{ card.channelKey }}</NText>
                  <NTag
                    :type="pluginStatusType(card)"
                    size="small"
                    :bordered="false"
                  >
                    {{ pluginStatusLabel(card) }}
                  </NTag>
                  <NTag
                    :type="card.configured ? 'success' : 'default'"
                    size="small"
                    :bordered="false"
                  >
                    {{ card.configured ? t('pages.channels.configured') : t('pages.channels.notConfigured') }}
                  </NTag>
                </NSpace>
              </template>

              <NSpace vertical :size="10" class="channel-section-stack">
                <div class="channel-desc-panel">
                  <span>{{ card.description }}</span>
                  <a :href="card.guideUrl" target="_blank" rel="noopener noreferrer" class="desc-link">
                    {{ t('pages.channels.viewGuide') }}
                  </a>
                </div>

                <NCard
                  v-if="!card.pluginInstalled || !card.configured"
                  size="small"
                  embedded
                  :title="t('pages.channels.installCardTitle')"
                >
                  <NSpace justify="space-between" align="center" class="channel-install-row">
                    <NText depth="3">
                      {{
                        !card.pluginInstalled
                          ? (
                              card.pluginStatusKnown
                                ? t('pages.channels.installHint.known', { channel: card.label })
                                : t('pages.channels.installHint.unknown', { channel: card.label })
                            )
                          : t('pages.channels.installHint.installed', { channel: card.label })
                      }}
                    </NText>
                    <NButton
                      type="primary"
                      :loading="installLoading[card.channelKey]"
                      @click="installChannel(card)"
                    >
                      <template #icon><NIcon :component="AddOutline" /></template>
                      {{
                        card.pluginInstalled
                          ? t('pages.channels.installActions.generateConfig')
                          : (card.pluginStatusKnown
                              ? t('pages.channels.installActions.installAndConfig')
                              : t('pages.channels.installActions.tryInstallAndConfig'))
                      }}
                    </NButton>
                  </NSpace>

                  <NAlert
                    v-if="!card.pluginStatusKnown"
                    type="warning"
                    :bordered="false"
                    style="margin-top: 10px;"
                  >
                    {{ t('pages.channels.remoteInstallFallback') }}
                    <div
                      v-for="command in buildPluginInstallCommands(card.pluginPackages)"
                      :key="`${card.channelKey}-${command}`"
                      style="margin-top: 6px;"
                    >
                      <code>{{ command }}</code>
                    </div>
                  </NAlert>
                </NCard>

                <NCard v-if="card.configured" size="small" :title="t('pages.channels.basicConfigTitle')" embedded>
                  <NForm label-placement="left" label-width="140" class="channel-config-form">
                    <NFormItem :label="t('pages.channels.labels.enabled')">
                      <NSwitch
                        :value="channelEnabled(card.channelKey)"
                        @update:value="(value) => updateChannelEnabled(card.channelKey, value)"
                      />
                    </NFormItem>
                    <NFormItem v-if="card.key === 'qqbot'" :label="t('pages.channels.labels.appId')">
                      <NInput
                        :value="channelAppId(card.channelKey)"
                        :placeholder="t('pages.channels.placeholders.qqAppId')"
                        @update:value="(value) => updateChannelAppId(card.channelKey, value)"
                      />
                    </NFormItem>
                    <NFormItem v-if="card.key === 'dingtalk'" :label="t('pages.channels.labels.clientId')">
                      <NInput
                        :value="channelClientId(card.channelKey)"
                        :placeholder="t('pages.channels.placeholders.dingtalkClientId')"
                        @update:value="(value) => updateChannelClientId(card.channelKey, value)"
                      />
                    </NFormItem>
                    <NFormItem v-if="card.key === 'qqbot'" :label="t('pages.channels.labels.markdownSupport')">
                      <NSwitch
                        :value="channelMarkdownSupport(card.channelKey)"
                        @update:value="(value) => updateChannelMarkdownSupport(card.channelKey, value)"
                      />
                    </NFormItem>
                  </NForm>
                </NCard>

                <NCard v-if="card.configured" size="small" :title="t('pages.channels.credentialsTitle')" embedded>
                  <NAlert type="info" :bordered="false" style="margin-bottom: 12px;">
                    {{ t('pages.channels.credentialsHint') }}
                  </NAlert>

                  <NSpace
                    v-if="card.visibleSecretKeys.length === 0"
                    justify="center"
                    style="padding: 8px 0;"
                  >
                    <NText depth="3">{{ t('pages.channels.noSecretFields') }}</NText>
                  </NSpace>

                  <NForm v-else label-placement="left" label-width="160" class="channel-secret-form">
                    <NFormItem
                      v-for="field in card.visibleSecretKeys"
                      :key="`channel-secret-${card.channelKey}-${field}`"
                      :label="field"
                    >
                      <NInputGroup>
                        <NInput :value="channelSecretValue(card.channelKey, field)" disabled style="width: 180px;" />
                        <NInput
                          type="password"
                          show-password-on="click"
                          :value="readSecretInput(card.channelKey, field)"
                          :placeholder="t('pages.channels.placeholders.secret')"
                          @update:value="(value) => updateSecretInput(card.channelKey, field, value)"
                        />
                        <NTag
                          v-if="hasSecretUpdate(card.channelKey, field)"
                          type="warning"
                          :bordered="false"
                          style="align-self: center;"
                        >
                          {{ t('pages.channels.pendingUpdate') }}
                        </NTag>
                      </NInputGroup>
                    </NFormItem>
                  </NForm>
                </NCard>
              </NSpace>
            </NCollapseItem>
          </NCollapse>
        </NSpin>
      </NSpace>
    </NCard>
  </NSpace>
</template>

<style scoped>
.channel-root-card {
  --channel-card-border: var(--border-color);
  --channel-card-bg: var(--bg-card);
  --channel-soft-bg: var(--bg-secondary);
  --channel-text: var(--text-primary);
  --channel-text-muted: var(--text-secondary);
  --channel-link: #2563eb;
  --channel-link-hover: #1d4ed8;
  --channel-thanks-bg:
    radial-gradient(circle at 88% -30%, rgba(24, 160, 88, 0.2), transparent 42%),
    linear-gradient(125deg, rgba(32, 128, 240, 0.12), rgba(24, 160, 88, 0.08)),
    var(--channel-soft-bg);
  --channel-thanks-border: rgba(32, 128, 240, 0.24);
  --channel-pill-bg: rgba(32, 128, 240, 0.08);
  --channel-pill-bg-hover: rgba(32, 128, 240, 0.15);
  --channel-pill-border: rgba(32, 128, 240, 0.3);
  --channel-desc-bg:
    linear-gradient(135deg, rgba(32, 128, 240, 0.11), rgba(32, 128, 240, 0.05)),
    var(--channel-soft-bg);
  --channel-desc-border: rgba(32, 128, 240, 0.24);
  --channel-collapse-hover: rgba(32, 128, 240, 0.06);
  --toolbar-refresh-bg: var(--bg-primary);
  --toolbar-refresh-border: var(--border-color);
  --toolbar-refresh-text: var(--text-primary);
  --toolbar-refresh-bg-hover: var(--bg-secondary);
  --toolbar-refresh-shadow: 0 6px 14px rgba(15, 23, 42, 0.1);
  --toolbar-refresh-shadow-hover: 0 10px 18px rgba(15, 23, 42, 0.14);
  --toolbar-save-shadow: 0 8px 18px rgba(5, 150, 105, 0.26);
  --toolbar-save-shadow-hover: 0 12px 22px rgba(5, 150, 105, 0.32);
  --toolbar-apply-shadow: 0 8px 18px rgba(245, 158, 11, 0.26);
  --toolbar-apply-shadow-hover: 0 12px 22px rgba(245, 158, 11, 0.32);
  border-radius: 18px;
  border: 1px solid var(--channel-card-border);
  background: var(--channel-card-bg);
  box-shadow: var(--shadow-sm);
}

:global([data-theme='dark'] .channel-root-card) {
  --channel-link: #93c5fd;
  --channel-link-hover: #bfdbfe;
  --channel-thanks-border: rgba(147, 197, 253, 0.35);
  --channel-pill-bg: rgba(59, 130, 246, 0.18);
  --channel-pill-bg-hover: rgba(59, 130, 246, 0.26);
  --channel-pill-border: rgba(147, 197, 253, 0.32);
  --channel-desc-border: rgba(147, 197, 253, 0.35);
  --channel-collapse-hover: rgba(59, 130, 246, 0.12);
  --toolbar-refresh-shadow: 0 6px 14px rgba(0, 0, 0, 0.3);
  --toolbar-refresh-shadow-hover: 0 10px 18px rgba(0, 0, 0, 0.4);
  --toolbar-save-shadow: 0 8px 16px rgba(5, 150, 105, 0.22);
  --toolbar-save-shadow-hover: 0 10px 20px rgba(5, 150, 105, 0.28);
  --toolbar-apply-shadow: 0 8px 16px rgba(245, 158, 11, 0.22);
  --toolbar-apply-shadow-hover: 0 10px 20px rgba(245, 158, 11, 0.28);
}

.toolbar-actions {
  align-items: center;
}

:deep(.channel-root-card > .n-card-header) {
  padding-bottom: 10px;
}

:deep(.channel-root-card > .n-card__content) {
  padding-top: 12px;
}

.toolbar-actions :deep(.toolbar-btn.n-button) {
  min-width: 132px;
  height: 40px;
  border-radius: 12px;
  padding: 0 18px;
  font-weight: 700;
  letter-spacing: 0.2px;
  transition: transform 0.14s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.toolbar-actions :deep(.toolbar-btn .n-icon) {
  font-size: 16px;
}

.toolbar-actions :deep(.toolbar-btn:not(.n-button--disabled):hover) {
  transform: translateY(-1px);
}

.toolbar-actions :deep(.toolbar-btn:not(.n-button--disabled):active) {
  transform: translateY(0);
}

.toolbar-actions :deep(.toolbar-btn--refresh.n-button) {
  background: var(--toolbar-refresh-bg) !important;
  border: 1px solid var(--toolbar-refresh-border) !important;
  color: var(--toolbar-refresh-text) !important;
  box-shadow: var(--toolbar-refresh-shadow);
}

.toolbar-actions :deep(.toolbar-btn--refresh.n-button:not(.n-button--disabled):hover) {
  border-color: var(--toolbar-refresh-border) !important;
  background: var(--toolbar-refresh-bg-hover) !important;
  box-shadow: var(--toolbar-refresh-shadow-hover);
}

.toolbar-actions :deep(.toolbar-btn--save.n-button) {
  background: linear-gradient(135deg, #16a34a 0%, #059669 100%) !important;
  border: none !important;
  color: #ffffff !important;
  box-shadow: var(--toolbar-save-shadow);
}

.toolbar-actions :deep(.toolbar-btn--save.n-button:not(.n-button--disabled):hover) {
  filter: brightness(1.04);
  box-shadow: var(--toolbar-save-shadow-hover);
}

.toolbar-actions :deep(.toolbar-btn--apply.n-button) {
  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%) !important;
  border: none !important;
  color: #ffffff !important;
  box-shadow: var(--toolbar-apply-shadow);
}

.toolbar-actions :deep(.toolbar-btn--apply.n-button:not(.n-button--disabled):hover) {
  filter: brightness(1.04);
  box-shadow: var(--toolbar-apply-shadow-hover);
}

.toolbar-actions :deep(.toolbar-btn.n-button.n-button--disabled) {
  opacity: 0.7;
  box-shadow: none !important;
}

.thanks-panel {
  border: 1px solid var(--channel-thanks-border);
  border-radius: 14px;
  background: var(--channel-thanks-bg);
  color: var(--channel-text);
  padding: 14px 16px 12px;
}

.thanks-title-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  line-height: 1.55;
}

.thanks-icon {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: rgba(24, 160, 88, 0.18);
  color: #18a058;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 13px;
  box-shadow: inset 0 0 0 1px rgba(24, 160, 88, 0.34);
}

.banner-link {
  font-weight: 700;
  color: var(--channel-link);
  text-decoration: none;
}

.banner-link:hover {
  color: var(--channel-link-hover);
  text-decoration: underline;
}

.guide-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  margin-left: 36px;
}

.guide-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--channel-pill-border);
  background: var(--channel-pill-bg);
  color: var(--channel-link);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  transition: background-color 0.15s ease, transform 0.15s ease;
}

.guide-pill:hover {
  background: var(--channel-pill-bg-hover);
  transform: translateY(-1px);
}

.channel-header-row {
  flex-wrap: wrap;
  row-gap: 6px;
}

.channel-brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  color: #fff;
  font-size: 12px;
  box-shadow: 0 6px 12px rgba(15, 23, 42, 0.22);
}

.channel-brand--qqbot {
  background: linear-gradient(135deg, #111827 0%, #2563eb 100%);
}

.channel-brand--feishu {
  background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
}

.channel-brand--dingtalk {
  background: linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%);
}

.channel-brand--wecom {
  background: linear-gradient(135deg, #16a34a 0%, #0ea5a4 100%);
}

.channel-key-text {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.channel-desc-panel {
  border: 1px solid var(--channel-desc-border);
  border-radius: 10px;
  background: var(--channel-desc-bg);
  color: var(--channel-text);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  flex-wrap: wrap;
}

.channel-section-stack {
  margin-top: 6px;
}

.channel-install-row {
  row-gap: 10px;
}

:deep(.channel-install-row .n-button) {
  flex-shrink: 0;
}

.desc-link {
  color: var(--channel-link);
  font-weight: 600;
  text-decoration: none;
}

.desc-link:hover {
  color: var(--channel-link-hover);
  text-decoration: underline;
}

:deep(.n-collapse-item) {
  border: 1px solid var(--channel-card-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--channel-card-bg) !important;
  transition: background-color 160ms ease;
  margin: 0 !important;
}

:deep(.n-collapse) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 0;
}

:deep(.n-collapse-item:not(:first-child)) {
  border-top: none !important;
}

:deep(.n-collapse-item .n-collapse-item__header) {
  padding: 10px 12px;
}

:deep(.n-collapse-item:first-child > .n-collapse-item__header) {
  padding-top: 10px !important;
}

:deep(.n-collapse-item .n-collapse-item__header-main) {
  color: var(--channel-text);
}

:deep(.n-collapse-item .n-collapse-item__content-wrapper) {
  border-top: 1px solid var(--channel-card-border);
  background: var(--channel-card-bg);
}

:deep(.n-collapse-item .n-collapse-item__content-inner) {
  padding: 10px 12px 12px;
}

:deep(.n-collapse-item__content-wrapper .n-collapse-item__content-inner) {
  padding-top: 10px !important;
}

:deep(.n-card.n-card--embedded) {
  background: var(--channel-soft-bg);
  color: var(--channel-text);
  border-color: var(--channel-card-border);
}

:deep(.n-collapse-item:hover) {
  background: var(--channel-collapse-hover) !important;
}

:deep(.n-alert-body code),
:deep(code) {
  border-radius: 6px;
  border: 1px solid var(--channel-card-border);
  background: var(--bg-primary);
  color: var(--channel-text);
  padding: 2px 6px;
}

:deep(.channel-config-form .n-form-item),
:deep(.channel-secret-form .n-form-item) {
  margin-bottom: 10px;
}

:deep(.channel-config-form .n-form-item:last-child),
:deep(.channel-secret-form .n-form-item:last-child) {
  margin-bottom: 0;
}

@media (max-width: 900px) {
  .toolbar-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .toolbar-actions :deep(.toolbar-btn.n-button) {
    min-width: 118px;
  }
}

@media (max-width: 640px) {
  .guide-pill-row {
    margin-left: 0;
  }

  .thanks-panel {
    padding: 12px 12px 10px;
  }

  .thanks-title-row {
    gap: 8px;
  }

  .channel-desc-panel {
    align-items: flex-start;
    flex-direction: column;
  }

  :deep(.n-collapse-item .n-collapse-item__header) {
    padding: 9px 10px;
  }

  :deep(.n-collapse-item:first-child > .n-collapse-item__header) {
    padding-top: 9px !important;
  }

  :deep(.n-collapse-item .n-collapse-item__content-inner) {
    padding: 9px 10px 10px;
  }

  :deep(.channel-secret-form .n-input-group) {
    flex-wrap: wrap;
    gap: 8px;
  }

  :deep(.channel-secret-form .n-input-group > .n-input) {
    width: 100% !important;
  }

  .toolbar-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
