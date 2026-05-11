<script setup lang="ts">
import { computed, watch } from 'vue'
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputGroup,
  NInputNumber,
  NSelect,
  NSwitch,
  NTag,
  NText,
  NSpace,
  NButton,
  NAlert,
  NDivider,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { usePluginsStore, type MediaClawPluginConfig, type MediaClawCapabilityConfig } from '@/stores/plugins'

const props = defineProps<{
  pluginId: string
}>()

const { t } = useI18n()
const store = usePluginsStore()

// 提供商选项
const providerOptions = computed(() => [
  { label: 'YuanJing (元景)', value: 'yuanjing' },
  { label: 'SGLang', value: 'sglang' },
])

// 视频模型选项
const videoModelOptions = computed(() => [
  { label: t('pages.plugins.mediaclaw.capabilities.videoModelWan'), value: 'wan' },
  { label: t('pages.plugins.mediaclaw.capabilities.videoModelKling'), value: 'kling' },
])

// 能力列表
const capabilities = [
  { key: 'textToImage', labelKey: 'pages.plugins.mediaclaw.capabilities.textToImage', supportsVideoModel: false },
  { key: 'textToVideo', labelKey: 'pages.plugins.mediaclaw.capabilities.textToVideo', supportsVideoModel: true },
  { key: 'imageToVideo', labelKey: 'pages.plugins.mediaclaw.capabilities.imageToVideo', supportsVideoModel: true },
  { key: 'imagesToVideo', labelKey: 'pages.plugins.mediaclaw.capabilities.imagesToVideo', supportsVideoModel: true },
  { key: 'imageQA', labelKey: 'pages.plugins.mediaclaw.capabilities.imageQA', supportsVideoModel: false },
  { key: 'textToSpeech', labelKey: 'pages.plugins.mediaclaw.capabilities.textToSpeech', supportsVideoModel: false },
  { key: 'digitalAvatar', labelKey: 'pages.plugins.mediaclaw.capabilities.digitalAvatar', supportsVideoModel: false },
]

// 获取配置
const config = computed<MediaClawPluginConfig>(() => store.getMediaClawConfig(props.pluginId))

// Providers 配置
const yuanjingConfig = computed(() => config.value.providers?.yuanjing || {})
const sglangConfig = computed(() => config.value.providers?.sglang || {})

// 全局设置
const defaultProvider = computed({
  get: () => config.value.defaultProvider || 'yuanjing',
  set: (v) => store.setPluginField(props.pluginId, 'defaultProvider', v),
})

const outputDir = computed({
  get: () => config.value.outputDir || '',
  set: (v) => store.setPluginField(props.pluginId, 'outputDir', v || undefined),
})

const videoPollInterval = computed({
  get: () => config.value.videoPollInterval ?? 5000,
  set: (v) => store.setPluginField(props.pluginId, 'videoPollInterval', v || undefined),
})

const videoMaxWaitTime = computed({
  get: () => config.value.videoMaxWaitTime ?? 300000,
  set: (v) => store.setPluginField(props.pluginId, 'videoMaxWaitTime', v || undefined),
})

// YuanJing 提供商配置
const yuanjingApiKey = computed({
  get: () => store.getSecretUpdate(props.pluginId, 'yuanjing', 'apiKey'),
  set: (v) => store.setSecretUpdate(props.pluginId, 'yuanjing', 'apiKey', v),
})

const yuanjingBaseUrl = computed({
  get: () => yuanjingConfig.value.baseUrl || '',
  set: (v) => store.setPluginField(props.pluginId, 'providers.yuanjing.baseUrl', v || undefined),
})

// SGLang 提供商配置
const sglangApiKey = computed({
  get: () => store.getSecretUpdate(props.pluginId, 'sglang', 'apiKey'),
  set: (v) => store.setSecretUpdate(props.pluginId, 'sglang', 'apiKey', v),
})

const sglangBaseUrl = computed({
  get: () => sglangConfig.value.baseUrl || '',
  set: (v) => store.setPluginField(props.pluginId, 'providers.sglang.baseUrl', v || undefined),
})

const sglangApiPath = computed({
  get: () => sglangConfig.value.apiPath || '',
  set: (v) => store.setPluginField(props.pluginId, 'providers.sglang.apiPath', v || undefined),
})

// 能力配置
function getCapabilityConfig(capKey: string): MediaClawCapabilityConfig {
  return config.value.capabilities?.[capKey] || {}
}

function setCapabilityProvider(capKey: string, provider: string | null): void {
  if (provider) {
    store.setPluginField(props.pluginId, `capabilities.${capKey}.provider`, provider)
  } else {
    store.setPluginField(props.pluginId, `capabilities.${capKey}.provider`, undefined)
  }
}

function setCapabilityVideoModel(capKey: string, model: string | null): void {
  if (model) {
    store.setPluginField(props.pluginId, `capabilities.${capKey}.videoModel`, model)
  } else {
    store.setPluginField(props.pluginId, `capabilities.${capKey}.videoModel`, undefined)
  }
}

// 检查是否有待更新的敏感字段
const hasYuanjingApiKeyUpdate = computed(() => store.hasSecretUpdate(props.pluginId, 'yuanjing', 'apiKey'))
const hasSglangApiKeyUpdate = computed(() => store.hasSecretUpdate(props.pluginId, 'sglang', 'apiKey'))
</script>

<template>
  <NSpace vertical :size="16">
    <!-- 提供商配置 -->
    <NCard :title="t('pages.plugins.mediaclaw.providers.title')" size="small" embedded>
      <NSpace vertical :size="16">
        <!-- YuanJing -->
        <NCard size="small" :bordered="false" style="background: var(--n-color);">
          <template #header>
            <NSpace align="center" :size="8">
              <NText strong>{{ t('pages.plugins.mediaclaw.providers.yuanjing') }}</NText>
              <NTag size="small" type="success" :bordered="false">{{ t('pages.plugins.mediaclaw.capabilities.provider') }}</NTag>
            </NSpace>
          </template>
          <NForm label-placement="left" label-width="100">
            <NFormItem :label="t('pages.plugins.mediaclaw.providers.apiKey')">
              <NInputGroup>
                <NInput
                  :value="store.getMaskedSecret(pluginId, 'yuanjing', 'apiKey')"
                  disabled
                  style="width: 180px;"
                />
                <NInput
                  v-model:value="yuanjingApiKey"
                  type="password"
                  show-password-on="click"
                  :placeholder="t('pages.plugins.secretPlaceholder')"
                  @update:value="(v: string) => store.setSecretUpdate(pluginId, 'yuanjing', 'apiKey', v)"
                />
                <NTag v-if="hasYuanjingApiKeyUpdate" type="warning" :bordered="false">
                  {{ t('pages.plugins.pendingUpdate') }}
                </NTag>
              </NInputGroup>
            </NFormItem>
            <NFormItem :label="t('pages.plugins.mediaclaw.providers.baseUrl')">
              <NInput
                v-model:value="yuanjingBaseUrl"
                placeholder="https://maas-api.ai-yuanjing.com"
                clearable
              />
            </NFormItem>
          </NForm>
        </NCard>

        <!-- SGLang -->
        <NCard size="small" :bordered="false" style="background: var(--n-color);">
          <template #header>
            <NSpace align="center" :size="8">
              <NText strong>{{ t('pages.plugins.mediaclaw.providers.sglang') }}</NText>
              <NTag size="small" type="info" :bordered="false">{{ t('pages.plugins.mediaclaw.capabilities.provider') }}</NTag>
            </NSpace>
          </template>
          <NForm label-placement="left" label-width="100">
            <NFormItem :label="t('pages.plugins.mediaclaw.providers.baseUrl')">
              <NInput
                v-model:value="sglangBaseUrl"
                placeholder="http://localhost:30010"
                clearable
              />
            </NFormItem>
            <NFormItem :label="t('pages.plugins.mediaclaw.providers.apiKey')">
              <NInputGroup>
                <NInput
                  :value="store.getMaskedSecret(pluginId, 'sglang', 'apiKey')"
                  disabled
                  style="width: 180px;"
                />
                <NInput
                  v-model:value="sglangApiKey"
                  type="password"
                  show-password-on="click"
                  :placeholder="t('pages.plugins.secretPlaceholder')"
                  @update:value="(v: string) => store.setSecretUpdate(pluginId, 'sglang', 'apiKey', v)"
                />
                <NTag v-if="hasSglangApiKeyUpdate" type="warning" :bordered="false">
                  {{ t('pages.plugins.pendingUpdate') }}
                </NTag>
              </NInputGroup>
            </NFormItem>
            <NFormItem label="API Path">
              <NInput
                v-model:value="sglangApiPath"
                placeholder="/v1"
                clearable
              />
            </NFormItem>
          </NForm>
        </NCard>
      </NSpace>
    </NCard>

    <!-- 能力配置 -->
    <NCard :title="t('pages.plugins.mediaclaw.capabilities.title')" size="small" embedded>
      <template #header-extra>
        <NText depth="3" style="font-size: 12px;">
          {{ t('pages.plugins.mediaclaw.capabilities.description') }}
        </NText>
      </template>

      <NAlert type="info" :bordered="false" style="margin-bottom: 12px;">
        {{ t('pages.plugins.mediaclaw.capabilities.description') }}
      </NAlert>

      <NSpace vertical :size="12">
        <NCard
          v-for="cap in capabilities"
          :key="cap.key"
          size="small"
          :bordered="false"
          style="background: var(--n-color);"
        >
          <NSpace align="center" justify="space-between" :size="12" :wrap="false">
            <NText strong style="min-width: 100px;">{{ t(cap.labelKey) }}</NText>
            <NSpace :size="12" :wrap="false">
              <NSelect
                :value="getCapabilityConfig(cap.key).provider || null"
                :options="providerOptions"
                :placeholder="t('pages.plugins.mediaclaw.capabilities.provider')"
                clearable
                style="width: 160px;"
                @update:value="(v: string | null) => setCapabilityProvider(cap.key, v)"
              />
              <NSelect
                v-if="cap.supportsVideoModel"
                :value="getCapabilityConfig(cap.key).videoModel || null"
                :options="videoModelOptions"
                :placeholder="t('pages.plugins.mediaclaw.capabilities.videoModel')"
                clearable
                style="width: 140px;"
                @update:value="(v: string | null) => setCapabilityVideoModel(cap.key, v)"
              />
            </NSpace>
          </NSpace>
        </NCard>
      </NSpace>
    </NCard>

    <!-- 全局设置 -->
    <NCard :title="t('pages.plugins.mediaclaw.global.title')" size="small" embedded>
      <NForm label-placement="left" label-width="140">
        <NFormItem :label="t('pages.plugins.mediaclaw.global.defaultProvider')">
          <NSelect
            v-model:value="defaultProvider"
            :options="providerOptions"
            style="width: 200px;"
          />
        </NFormItem>
        <NFormItem :label="t('pages.plugins.mediaclaw.global.outputDir')">
          <NInput
            v-model:value="outputDir"
            placeholder="/path/to/output"
            clearable
          />
        </NFormItem>
        <NFormItem :label="t('pages.plugins.mediaclaw.global.videoPollInterval')">
          <NInputNumber
            v-model:value="videoPollInterval"
            :min="1000"
            :max="60000"
            :step="1000"
            style="width: 150px;"
          />
        </NFormItem>
        <NFormItem :label="t('pages.plugins.mediaclaw.global.videoMaxWaitTime')">
          <NInputNumber
            v-model:value="videoMaxWaitTime"
            :min="60000"
            :max="600000"
            :step="60000"
            style="width: 150px;"
          />
        </NFormItem>
      </NForm>
    </NCard>
  </NSpace>
</template>

<style scoped>
:deep(.n-card.n-card--embedded) {
  background: var(--bg-secondary);
}
</style>
