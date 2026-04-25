<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NInputGroup,
  NInputGroupLabel,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NText,
  NForm,
  NFormItem,
  NDivider,
  useMessage,
  type FormInst,
} from 'naive-ui'
import {
  CloudOutline,
  CheckmarkCircleOutline,
  PowerOutline,
  AlertCircleOutline,
  RefreshOutline,
  SearchOutline,
  AddOutline,
  CreateOutline,
  TrashOutline,
  SettingsOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useHermesChannelStore } from '@/stores/hermes/channel'
import type { HermesPlatform } from '@/api/hermes/types'

const { t } = useI18n()
const channelStore = useHermesChannelStore()
const message = useMessage()
const formRef = ref<FormInst | null>(null)

// ---- 搜索与筛选 ----

const searchQuery = ref('')
const statusFilter = ref<string>('all')

type StatusFilterValue = 'all' | 'configured' | 'notConfigured' | 'enabled' | 'disabled'

const statusOptions = computed(() => [
  { label: t('pages.hermesChannels.filter.all'), value: 'all' },
  { label: t('pages.hermesChannels.filter.configured'), value: 'configured' },
  { label: t('pages.hermesChannels.filter.notConfigured'), value: 'notConfigured' },
  { label: t('pages.hermesChannels.filter.enabled'), value: 'enabled' },
  { label: t('pages.hermesChannels.filter.disabled'), value: 'disabled' },
])

const filteredPlatforms = computed(() => {
  let list = channelStore.platforms

  if (searchQuery.value.trim()) {
    const keyword = searchQuery.value.trim().toLowerCase()
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(keyword) ||
        p.type.toLowerCase().includes(keyword),
    )
  }

  const filter = statusFilter.value as StatusFilterValue
  if (filter === 'configured') {
    list = list.filter((p) => p.configured)
  } else if (filter === 'notConfigured') {
    list = list.filter((p) => !p.configured)
  } else if (filter === 'enabled') {
    list = list.filter((p) => p.enabled)
  } else if (filter === 'disabled') {
    list = list.filter((p) => !p.enabled)
  }

  return list
})

// ---- 统计面板 ----

const stats = computed(() => {
  const all = channelStore.platforms
  return {
    total: all.length,
    configured: all.filter((p) => p.configured).length,
    enabled: all.filter((p) => p.enabled).length,
    notConfigured: all.filter((p) => !p.configured).length,
  }
})

// ---- 平台类型选项 ----

const platformTypes = [
  { label: 'Telegram', value: 'telegram' },
  { label: 'Discord', value: 'discord' },
  { label: 'Slack', value: 'slack' },
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'Signal', value: 'signal' },
  { label: 'Matrix', value: 'matrix' },
  { label: '企业微信', value: 'wecom' },
  { label: '钉钉', value: 'dingtalk' },
  { label: '飞书', value: 'feishu' },
  { label: '微信', value: 'wechat' },
  { label: 'QQ', value: 'qq' },
]

const chinaPlatformTypes = ['wecom', 'dingtalk', 'feishu', 'wechat', 'qq']

// ---- 模态框状态 ----

const showModal = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingPlatform = ref<HermesPlatform | null>(null)
const formData = ref({
  id: '',
  name: '',
  type: 'telegram',
  enabled: true,
  token: '',
  apiKey: '',
  apiBase: '',
  requireMention: true,
  allowedUsers: '',
  freeResponseChannels: '',
  corpId: '',
  agentId: '',
  secret: '',
  appId: '',
  appSecret: '',
  clientId: '',
  clientSecret: '',
})

// ---- 生命周期 ----

onMounted(() => {
  channelStore.fetchPlatforms().catch(() => {
    message.error(t('pages.hermesChannels.loadFailed'))
  })
})

// ---- 操作 ----

async function handleRefresh() {
  try {
    await channelStore.fetchPlatforms()
  } catch {
    message.error(t('pages.hermesChannels.loadFailed'))
  }
}

async function handleToggle(platformId: string, enabled: boolean) {
  try {
    await channelStore.updatePlatform(platformId, { enabled })
    message.success(
      enabled
        ? t('pages.hermesChannels.enableSuccess')
        : t('pages.hermesChannels.disableSuccess'),
    )
  } catch {
    message.error(t('pages.hermesChannels.toggleFailed'))
  }
}

function openCreateModal() {
  modalMode.value = 'create'
  editingPlatform.value = null
  formData.value = {
    id: '',
    name: '',
    type: 'telegram',
    enabled: true,
    token: '',
    apiKey: '',
    apiBase: '',
    requireMention: true,
    allowedUsers: '',
    freeResponseChannels: '',
    corpId: '',
    agentId: '',
    secret: '',
    appId: '',
    appSecret: '',
    clientId: '',
    clientSecret: '',
  }
  showModal.value = true
}

function openEditModal(platform: HermesPlatform) {
  modalMode.value = 'edit'
  editingPlatform.value = platform
  const config = platform.config || {}
  formData.value = {
    id: platform.id,
    name: platform.name,
    type: platform.type,
    enabled: platform.enabled,
    token: (config.token as string) || '',
    apiKey: (config.apiKey as string) || '',
    apiBase: (config.apiBase as string) || '',
    requireMention: config.requireMention !== false,
    allowedUsers: (config.allowedUsers as string) || '',
    freeResponseChannels: (config.freeResponseChannels as string) || '',
    corpId: (config.corpId as string) || '',
    agentId: (config.agentId as string) || '',
    secret: (config.secret as string) || '',
    appId: (config.appId as string) || '',
    appSecret: (config.appSecret as string) || '',
    clientId: (config.clientId as string) || '',
    clientSecret: (config.clientSecret as string) || '',
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingPlatform.value = null
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  const platformId = formData.value.id.trim().toLowerCase()
  if (!platformId) {
    message.error(t('pages.hermesChannels.idRequired'))
    return
  }

  const config: Record<string, unknown> = {
    name: formData.value.name || platformId,
    type: formData.value.type,
    enabled: formData.value.enabled,
    requireMention: formData.value.requireMention,
  }

  if (formData.value.token) {
    config.token = formData.value.token
  }
  if (formData.value.apiKey) {
    config.apiKey = formData.value.apiKey
  }
  if (formData.value.apiBase) {
    config.apiBase = formData.value.apiBase
  }
  if (formData.value.allowedUsers) {
    config.allowedUsers = formData.value.allowedUsers
  }
  if (formData.value.freeResponseChannels) {
    config.freeResponseChannels = formData.value.freeResponseChannels
  }

  if (formData.value.corpId) {
    config.corpId = formData.value.corpId
  }
  if (formData.value.agentId) {
    config.agentId = formData.value.agentId
  }
  if (formData.value.secret) {
    config.secret = formData.value.secret
  }
  if (formData.value.appId) {
    config.appId = formData.value.appId
  }
  if (formData.value.appSecret) {
    config.appSecret = formData.value.appSecret
  }
  if (formData.value.clientId) {
    config.clientId = formData.value.clientId
  }
  if (formData.value.clientSecret) {
    config.clientSecret = formData.value.clientSecret
  }

  try {
    if (modalMode.value === 'create') {
      await channelStore.createPlatform(platformId, config)
      message.success(t('pages.hermesChannels.createSuccess'))
    } else {
      await channelStore.updatePlatform(platformId, config)
      message.success(t('pages.hermesChannels.updateSuccess'))
    }
    closeModal()
  } catch (error) {
    message.error(
      modalMode.value === 'create'
        ? t('pages.hermesChannels.createFailed')
        : t('pages.hermesChannels.updateFailed'),
    )
  }
}

async function handleDelete(platformId: string) {
  try {
    await channelStore.deletePlatform(platformId)
    message.success(t('pages.hermesChannels.deleteSuccess'))
  } catch {
    message.error(t('pages.hermesChannels.deleteFailed'))
  }
}

const rules = {
  id: {
    required: true,
    validator: (_: unknown, value: string) => {
      if (!value || !value.trim()) {
        return new Error(t('pages.hermesChannels.idRequired'))
      }
      if (!/^[a-z][a-z0-9_-]*$/.test(value.trim().toLowerCase())) {
        return new Error(t('pages.hermesChannels.idFormat'))
      }
      return true
    },
  },
}
</script>

<template>
  <div class="hermes-channels-page">
    <!-- 顶部 Hero 面板：标题 + 统计 -->
    <NCard :bordered="false" class="hermes-hero">
      <div class="hermes-hero-header">
        <NSpace align="center" :size="10">
          <NIcon :component="CloudOutline" :size="22" style="color: var(--primary-color);" />
          <span class="hermes-hero-title">{{ t('pages.hermesChannels.title') }}</span>
        </NSpace>
        <NSpace align="center" :size="12">
          <NText depth="3" style="font-size: 13px;">
            {{ t('pages.hermesChannels.subtitle') }}
          </NText>
          <NButton
            type="primary"
            size="small"
            @click="openCreateModal"
          >
            <template #icon>
              <NIcon :component="AddOutline" />
            </template>
            {{ t('pages.hermesChannels.create') }}
          </NButton>
        </NSpace>
      </div>

      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="10" :y-gap="10" style="margin-top: 16px;">
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesChannels.stats.total') }}</NText>
              <NIcon :component="CloudOutline" />
            </NSpace>
            <div class="hermes-metric-value">{{ stats.total }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesChannels.stats.configured') }}</NText>
              <NIcon :component="CheckmarkCircleOutline" style="color: var(--success-color);" />
            </NSpace>
            <div class="hermes-metric-value" style="color: var(--success-color);">
              {{ stats.configured }}
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesChannels.stats.enabled') }}</NText>
              <NIcon :component="PowerOutline" style="color: var(--primary-color);" />
            </NSpace>
            <div class="hermes-metric-value" style="color: var(--primary-color);">
              {{ stats.enabled }}
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="hermes-metric-card">
            <NSpace justify="space-between" align="center">
              <NText depth="3">{{ t('pages.hermesChannels.stats.notConfigured') }}</NText>
              <NIcon :component="AlertCircleOutline" style="color: var(--warning-color);" />
            </NSpace>
            <div class="hermes-metric-value" style="color: var(--warning-color);">
              {{ stats.notConfigured }}
            </div>
          </NCard>
        </NGridItem>
      </NGrid>
    </NCard>

    <!-- 搜索与筛选栏 -->
    <NCard :bordered="false" class="app-card hermes-filter-card">
      <div class="hermes-filter-bar">
        <NInput
          v-model:value="searchQuery"
          clearable
          :placeholder="t('pages.hermesChannels.searchPlaceholder')"
        >
          <template #prefix>
            <NIcon :component="SearchOutline" />
          </template>
        </NInput>
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          style="min-width: 160px;"
        />
        <NIcon
          :component="RefreshOutline"
          :size="20"
          class="hermes-refresh-icon"
          :class="{ 'is-loading': channelStore.loading }"
          @click="handleRefresh"
        />
      </div>
    </NCard>

    <!-- 错误提示 -->
    <NAlert v-if="channelStore.lastError" type="error" :bordered="false" closable>
      {{ channelStore.lastError }}
    </NAlert>

    <!-- 平台卡片列表 -->
    <NSpin :show="channelStore.loading">
      <NGrid
        v-if="filteredPlatforms.length > 0"
        cols="1 s:2 m:3"
        responsive="screen"
        :x-gap="12"
        :y-gap="12"
      >
        <NGridItem v-for="platform in filteredPlatforms" :key="platform.id">
          <NCard class="app-card hermes-platform-card" hoverable>
            <NSpace vertical :size="12">
              <!-- 头部：名称 + 状态标签 -->
              <NSpace justify="space-between" align="center">
                <NText strong style="font-size: 15px;">{{ platform.name }}</NText>
                <NSpace :size="6">
                  <NTag
                    :type="platform.configured ? 'success' : 'warning'"
                    size="small"
                    :bordered="false"
                    round
                  >
                    {{
                      platform.configured
                        ? t('pages.hermesChannels.configured')
                        : t('pages.hermesChannels.notConfigured')
                    }}
                  </NTag>
                </NSpace>
              </NSpace>

              <!-- 类型标签 -->
              <NTag size="small" :bordered="false" type="info">
                {{ t('pages.hermesChannels.type') }}: {{ platform.type }}
              </NTag>

              <!-- 启用开关 -->
              <NSpace justify="space-between" align="center">
                <NText depth="3" style="font-size: 13px;">
                  {{
                    platform.enabled
                      ? t('common.enabled')
                      : t('common.disabled')
                  }}
                </NText>
                <NSwitch
                  :value="platform.enabled"
                  size="small"
                  @update:value="(val: boolean) => handleToggle(platform.id, val)"
                />
              </NSpace>

              <!-- 操作按钮 -->
              <NDivider style="margin: 8px 0;" />
              <NSpace justify="end" :size="8">
                <NButton
                  size="small"
                  quaternary
                  @click="openEditModal(platform)"
                >
                  <template #icon>
                    <NIcon :component="SettingsOutline" />
                  </template>
                  {{ t('pages.hermesChannels.configure') }}
                </NButton>
                <NButton
                  size="small"
                  quaternary
                  type="error"
                  @click="handleDelete(platform.id)"
                >
                  <template #icon>
                    <NIcon :component="TrashOutline" />
                  </template>
                  {{ t('common.delete') }}
                </NButton>
              </NSpace>
            </NSpace>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- 空状态 -->
      <NText
        v-else-if="!channelStore.loading"
        depth="3"
        style="display: block; text-align: center; padding: 48px 0;"
      >
        {{ t('common.empty') }}
      </NText>
    </NSpin>

    <!-- 编辑/新建模态框 -->
    <NModal v-model:show="showModal">
      <NCard
        style="width: 500px; max-width: 90vw;"
        :title="modalMode === 'create' ? t('pages.hermesChannels.create') : t('pages.hermesChannels.configure')"
        :bordered="false"
        size="medium"
        role="dialog"
        aria-modal="true"
      >
        <NForm
          ref="formRef"
          :model="formData"
          :rules="rules"
          label-placement="left"
          label-width="100"
        >
          <NFormItem :label="t('pages.hermesChannels.form.id')" path="id">
            <NInput
              v-model:value="formData.id"
              :placeholder="t('pages.hermesChannels.form.idPlaceholder')"
              :disabled="modalMode === 'edit'"
            />
          </NFormItem>
          <NFormItem :label="t('pages.hermesChannels.form.name')" path="name">
            <NInput
              v-model:value="formData.name"
              :placeholder="t('pages.hermesChannels.form.namePlaceholder')"
            />
          </NFormItem>
          <NFormItem :label="t('pages.hermesChannels.form.type')" path="type">
            <NSelect
              v-model:value="formData.type"
              :options="platformTypes"
              :placeholder="t('pages.hermesChannels.form.typePlaceholder')"
            />
          </NFormItem>

          <!-- 通用配置 -->
          <template v-if="!chinaPlatformTypes.includes(formData.type)">
            <NFormItem :label="t('pages.hermesChannels.form.token')" path="token">
              <NInput
                v-model:value="formData.token"
                type="password"
                show-password-on="click"
                :placeholder="t('pages.hermesChannels.form.tokenPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('pages.hermesChannels.form.apiKey')" path="apiKey">
              <NInput
                v-model:value="formData.apiKey"
                type="password"
                show-password-on="click"
                :placeholder="t('pages.hermesChannels.form.apiKeyPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('pages.hermesChannels.form.apiBase')" path="apiBase">
              <NInput
                v-model:value="formData.apiBase"
                :placeholder="t('pages.hermesChannels.form.apiBasePlaceholder')"
              />
            </NFormItem>
          </template>

          <!-- 企业微信配置 -->
          <template v-if="formData.type === 'wecom'">
            <NFormItem :label="t('pages.hermesChannels.form.corpId')" path="corpId">
              <NInput
                v-model:value="formData.corpId"
                :placeholder="t('pages.hermesChannels.form.corpIdPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('pages.hermesChannels.form.agentId')" path="agentId">
              <NInput
                v-model:value="formData.agentId"
                :placeholder="t('pages.hermesChannels.form.agentIdPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('pages.hermesChannels.form.secret')" path="secret">
              <NInput
                v-model:value="formData.secret"
                type="password"
                show-password-on="click"
                :placeholder="t('pages.hermesChannels.form.secretPlaceholder')"
              />
            </NFormItem>
          </template>

          <!-- 钉钉配置 -->
          <template v-if="formData.type === 'dingtalk'">
            <NFormItem :label="t('pages.hermesChannels.form.clientId')" path="clientId">
              <NInput
                v-model:value="formData.clientId"
                :placeholder="t('pages.hermesChannels.form.clientIdPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('pages.hermesChannels.form.clientSecret')" path="clientSecret">
              <NInput
                v-model:value="formData.clientSecret"
                type="password"
                show-password-on="click"
                :placeholder="t('pages.hermesChannels.form.clientSecretPlaceholder')"
              />
            </NFormItem>
          </template>

          <!-- 飞书配置 -->
          <template v-if="formData.type === 'feishu'">
            <NFormItem :label="t('pages.hermesChannels.form.appId')" path="appId">
              <NInput
                v-model:value="formData.appId"
                :placeholder="t('pages.hermesChannels.form.appIdPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('pages.hermesChannels.form.appSecret')" path="appSecret">
              <NInput
                v-model:value="formData.appSecret"
                type="password"
                show-password-on="click"
                :placeholder="t('pages.hermesChannels.form.appSecretPlaceholder')"
              />
            </NFormItem>
          </template>

          <!-- 微信配置 -->
          <template v-if="formData.type === 'wechat'">
            <NFormItem :label="t('pages.hermesChannels.form.appId')" path="appId">
              <NInput
                v-model:value="formData.appId"
                :placeholder="t('pages.hermesChannels.form.appIdPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('pages.hermesChannels.form.appSecret')" path="appSecret">
              <NInput
                v-model:value="formData.appSecret"
                type="password"
                show-password-on="click"
                :placeholder="t('pages.hermesChannels.form.appSecretPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('pages.hermesChannels.form.token')" path="token">
              <NInput
                v-model:value="formData.token"
                :placeholder="t('pages.hermesChannels.form.tokenPlaceholder')"
              />
            </NFormItem>
          </template>

          <!-- QQ配置 -->
          <template v-if="formData.type === 'qq'">
            <NFormItem :label="t('pages.hermesChannels.form.appId')" path="appId">
              <NInput
                v-model:value="formData.appId"
                :placeholder="t('pages.hermesChannels.form.appIdPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('pages.hermesChannels.form.secret')" path="secret">
              <NInput
                v-model:value="formData.secret"
                type="password"
                show-password-on="click"
                :placeholder="t('pages.hermesChannels.form.secretPlaceholder')"
              />
            </NFormItem>
          </template>

          <NFormItem :label="t('pages.hermesChannels.form.requireMention')" path="requireMention">
            <NSwitch v-model:value="formData.requireMention" />
          </NFormItem>
          <NFormItem :label="t('pages.hermesChannels.form.enabled')" path="enabled">
            <NSwitch v-model:value="formData.enabled" />
          </NFormItem>
        </NForm>

        <template #footer>
          <NSpace justify="end">
            <NButton @click="closeModal">
              {{ t('common.cancel') }}
            </NButton>
            <NButton type="primary" @click="handleSave">
              {{ t('common.save') }}
            </NButton>
          </NSpace>
        </template>
      </NCard>
    </NModal>
  </div>
</template>

<style scoped>
.hermes-channels-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---- Hero 面板 ---- */

.hermes-hero {
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 84% 16%, rgba(22, 163, 74, 0.22), transparent 36%),
    linear-gradient(135deg, rgba(22, 163, 74, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%);
  border: 1px solid rgba(22, 163, 74, 0.18);
}

.hermes-hero-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.hermes-hero-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

/* ---- 统计卡片 ---- */

.hermes-metric-card {
  border-radius: 10px;
}

.hermes-metric-value {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

/* ---- 筛选栏 ---- */

.hermes-filter-card {
  padding: 0;
}

.hermes-filter-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 180px) auto;
  gap: 10px;
  align-items: center;
}

@media (max-width: 640px) {
  .hermes-filter-bar {
    grid-template-columns: 1fr;
  }
}

.hermes-refresh-icon {
  cursor: pointer;
  color: var(--text-color-3);
  transition: color 0.2s ease, transform 0.3s ease;
}

.hermes-refresh-icon:hover {
  color: var(--primary-color);
}

.hermes-refresh-icon.is-loading {
  animation: hermes-spin 0.8s linear infinite;
}

@keyframes hermes-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ---- 平台卡片 ---- */

.hermes-platform-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.hermes-platform-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.08));
}
</style>
