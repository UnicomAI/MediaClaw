<script setup lang="ts">
import { onMounted, ref, computed, h, watch } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDivider,
  NForm,
  NFormItem,
  NIcon,
  NGrid,
  NGridItem,
  NInput,
  NSpace,
  NSpin,
  NSwitch,
  NInputNumber,
  NSelect,
  NText,
  NTag,
  NTabs,
  NTabPane,
  useMessage,
} from 'naive-ui'
import type { FormRules } from 'naive-ui'
import {
  RefreshOutline,
  SaveOutline,
  FlashOutline,
  PersonOutline,
  TextOutline,
  ServerOutline,
  CreateOutline,
  DocumentTextOutline,
  SparklesOutline,
  FolderOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useHermesConnectionStore } from '@/stores/hermes/connection'
import { formatDate } from '@/utils/format'
import { renderSimpleMarkdown } from '@/utils/markdown'

const { t } = useI18n()
const message = useMessage()
const authStore = useAuthStore()
const connStore = useHermesConnectionStore()

const loading = ref(false)
const saving = ref(false)
const lastError = ref<string | null>(null)

// 记忆配置字段
const memoryEnabled = ref(true)
const userProfileEnabled = ref(true)
const memoryCharLimit = ref(2200)
const userCharLimit = ref(1375)
const provider = ref('')

// Provider 选项
const providerOptions = computed(() => [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Local', value: 'local' },
  { label: 'Google', value: 'google' },
  { label: 'Mistral', value: 'mistral' },
  { label: `— ${t('pages.hermesMemory.customProvider')} —`, value: '__custom__' },
])

const isCustomProvider = computed(() => {
  return provider.value && !providerOptions.value.some(o => o.value !== '__custom__' && o.value === provider.value)
})

const customProviderValue = ref('')

const selectedProviderValue = computed({
  get: () => {
    if (isCustomProvider.value) return '__custom__'
    return provider.value || null
  },
  set: (val: string | null) => {
    if (val === '__custom__') {
      customProviderValue.value = provider.value || ''
    } else {
      provider.value = val || ''
    }
  },
})

const hasChanges = computed(() => {
  return (
    memoryEnabled.value !== originalConfig.value.memory_enabled ||
    userProfileEnabled.value !== originalConfig.value.user_profile_enabled ||
    memoryCharLimit.value !== originalConfig.value.memory_char_limit ||
    userCharLimit.value !== originalConfig.value.user_char_limit ||
    provider.value !== (originalConfig.value.provider || '')
  )
})

const originalConfig = ref<Record<string, any>>({})

// 表单验证规则
const formRules: FormRules = {
  memoryCharLimit: [
    {
      type: 'number' as const,
      required: true,
      min: 100,
      max: 100000,
      message: t('pages.hermesMemory.validation.charLimitRange'),
      trigger: ['blur', 'change'],
    },
  ],
  userCharLimit: [
    {
      type: 'number',
      required: true,
      min: 100,
      max: 100000,
      message: t('pages.hermesMemory.validation.charLimitRange'),
      trigger: ['blur', 'change'],
    },
  ],
}

// 文件定义
interface FileDef {
  name: string
  title: string
  description: string
  role: string
}

const userFiles: FileDef[] = [
  { name: 'USER.md', title: 'USER.md', description: t('pages.hermesMemory.files.userDesc'), role: t('pages.hermesMemory.files.userRole') },
  { name: 'MEMORY.md', title: 'MEMORY.md', description: t('pages.hermesMemory.files.memoryDesc'), role: t('pages.hermesMemory.files.memoryRole') },
]

const agentFiles: FileDef[] = [
  { name: 'SOUL.md', title: 'SOUL.md', description: t('pages.hermesMemory.files.soulDesc'), role: t('pages.hermesMemory.files.soulRole') },
  { name: 'IDENTITY.md', title: 'IDENTITY.md', description: t('pages.hermesMemory.files.identityDesc'), role: t('pages.hermesMemory.files.identityRole') },
  { name: 'AGENTS.md', title: 'AGENTS.md', description: t('pages.hermesMemory.files.agentsDesc'), role: t('pages.hermesMemory.files.agentsRole') },
  { name: 'TOOLS.md', title: 'TOOLS.md', description: t('pages.hermesMemory.files.toolsDesc'), role: t('pages.hermesMemory.files.toolsRole') },
  { name: 'BOOTSTRAP.md', title: 'BOOTSTRAP.md', description: t('pages.hermesMemory.files.bootstrapDesc'), role: t('pages.hermesMemory.files.bootstrapRole') },
]

// 文件状态管理
interface FileState {
  content: string
  path: string
  updatedAt: string | null
  size: number
  loading: boolean
  saving: boolean
  editorContent: string
  isEditing: boolean
}

const fileStates = ref<Record<string, FileState>>({})

function initFileState(fileName: string): FileState {
  if (!fileStates.value[fileName]) {
    fileStates.value[fileName] = {
      content: '',
      path: '',
      updatedAt: null,
      size: 0,
      loading: false,
      saving: false,
      editorContent: '',
      isEditing: false,
    }
  }
  return fileStates.value[fileName]
}

// 当前选中的文件
const currentUserFile = ref<string>('USER.md')
const currentAgentFile = ref<string>('SOUL.md')

// 计算属性
const hermesHome = computed(() => connStore.hermesStatus?.hermes_home || '')

function getAuthHeaders() {
  const token = authStore.token
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
}

// 配置相关函数
async function fetchConfig() {
  loading.value = true
  lastError.value = null
  try {
    const client = await connStore.getClientAsync()
    if (!client) throw new Error('Hermes 未连接')
    const config = await client.getConfig()
    const mem = (config.memory as Record<string, any>) || {}
    memoryEnabled.value = mem.memory_enabled !== false
    userProfileEnabled.value = mem.user_profile_enabled !== false
    memoryCharLimit.value = mem.memory_char_limit || 2200
    userCharLimit.value = mem.user_char_limit || 1375
    provider.value = mem.provider || ''
    originalConfig.value = { ...mem }
  } catch (err) {
    lastError.value = err instanceof Error ? err.message : String(err)
    message.error(t('pages.hermesMemory.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  lastError.value = null
  try {
    const client = await connStore.getClientAsync()
    if (!client) throw new Error('Hermes 未连接')
    await client.updateConfig({
      memory: {
        memory_enabled: memoryEnabled.value,
        user_profile_enabled: userProfileEnabled.value,
        memory_char_limit: memoryCharLimit.value,
        user_char_limit: userCharLimit.value,
        provider: provider.value || undefined,
      },
    })
    originalConfig.value = {
      memory_enabled: memoryEnabled.value,
      user_profile_enabled: userProfileEnabled.value,
      memory_char_limit: memoryCharLimit.value,
      user_char_limit: userCharLimit.value,
      provider: provider.value,
    }
    message.success(t('pages.hermesMemory.saveSuccess'))
  } catch (err) {
    lastError.value = err instanceof Error ? err.message : String(err)
    message.error(t('pages.hermesMemory.saveFailed'))
  } finally {
    saving.value = false
  }
}

function handleReset() {
  memoryEnabled.value = originalConfig.value.memory_enabled !== false
  userProfileEnabled.value = originalConfig.value.user_profile_enabled !== false
  memoryCharLimit.value = originalConfig.value.memory_char_limit || 2200
  userCharLimit.value = originalConfig.value.user_char_limit || 1375
  provider.value = originalConfig.value.provider || ''
}

// 文件操作函数
async function fetchFile(fileName: string) {
  if (!hermesHome.value) {
    console.warn('[HermesMemory] hermes_home not available')
    return
  }
  
  const state = initFileState(fileName)
  state.loading = true
  
  try {
    const response = await fetch(`/api/files/get?path=${encodeURIComponent(fileName)}&workspace=${encodeURIComponent(hermesHome.value)}`, {
      headers: getAuthHeaders()
    })
    
    const data = await response.json()
    
    if (!response.ok || !data.ok) {
      if (data.error?.message?.includes('not found') || data.error?.message?.includes('does not exist')) {
        state.content = ''
        state.path = `${hermesHome.value}/${fileName}`
        state.updatedAt = null
        state.size = 0
        state.editorContent = ''
      } else {
        throw new Error(data.error?.message || `Failed to read ${fileName}`)
      }
    } else {
      state.content = data.file?.content || ''
      state.path = `${hermesHome.value}/${fileName}`
      state.updatedAt = data.file?.modifiedAt || null
      state.size = data.file?.size || 0
      state.editorContent = state.content
    }
  } catch (err) {
    console.error(`[HermesMemory] fetchFile(${fileName}) failed:`, err)
    state.content = ''
  } finally {
    state.loading = false
  }
}

async function saveFile(fileName: string) {
  if (!hermesHome.value) {
    message.error('Hermes home not available')
    return
  }
  
  const state = initFileState(fileName)
  state.saving = true
  
  try {
    const response = await fetch('/api/files/set', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        path: fileName,
        workspace: hermesHome.value,
        content: state.editorContent
      })
    })
    
    const data = await response.json()
    
    if (!response.ok || !data.ok) {
      throw new Error(data.error?.message || `Failed to save ${fileName}`)
    }
    
    state.content = state.editorContent
    state.updatedAt = data.file?.modifiedAt || new Date().toISOString()
    state.size = data.file?.size || state.editorContent.length
    state.isEditing = false
    message.success(t('pages.hermesMemory.files.saved', { file: fileName }))
  } catch (err) {
    console.error(`[HermesMemory] saveFile(${fileName}) failed:`, err)
    message.error(t('common.saveFailed'))
  } finally {
    state.saving = false
  }
}

function startEdit(fileName: string) {
  const state = initFileState(fileName)
  state.isEditing = true
  state.editorContent = state.content
}

function cancelEdit(fileName: string) {
  const state = initFileState(fileName)
  state.editorContent = state.content
  state.isEditing = false
}

function resetEditor(fileName: string) {
  const state = initFileState(fileName)
  state.editorContent = state.content
  message.info(t('pages.hermesMemory.files.resetToLoaded'))
}

async function refreshFile(fileName: string) {
  const state = initFileState(fileName)
  if (state.isEditing && state.editorContent !== state.content) {
    if (!window.confirm(t('pages.hermesMemory.files.discardConfirm'))) return
  }
  state.isEditing = false
  await fetchFile(fileName)
  message.success(t('pages.hermesMemory.files.refreshed'))
}

// 计算属性
function getFileState(fileName: string) {
  return initFileState(fileName)
}

function hasUnsavedChanges(fileName: string) {
  const state = initFileState(fileName)
  return state.editorContent !== state.content
}

function charCount(fileName: string) {
  const state = initFileState(fileName)
  return state.editorContent.length
}

function lineCount(fileName: string) {
  const state = initFileState(fileName)
  return state.editorContent ? state.editorContent.split(/\r?\n/).length : 0
}

function previewHtml(fileName: string) {
  const state = initFileState(fileName)
  return renderSimpleMarkdown(state.content || '', {
    emptyHtml: `<p class="memory-markdown-empty">${t('pages.hermesMemory.files.emptyContent')}</p>`,
  })
}

function fileUpdatedText(fileName: string) {
  const state = initFileState(fileName)
  return state.updatedAt ? formatDate(state.updatedAt) : t('pages.hermesMemory.files.notCreated')
}

function fileSizeText(fileName: string) {
  const state = initFileState(fileName)
  const value = state.size
  if (!value || value <= 0) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function getFileDef(fileName: string): FileDef | undefined {
  return [...userFiles, ...agentFiles].find(f => f.name === fileName)
}

// 加载所有文件
async function loadAllFiles() {
  for (const file of [...userFiles, ...agentFiles]) {
    await fetchFile(file.name)
  }
}

// 监听 Tab 切换，加载对应文件
watch(currentUserFile, (fileName) => {
  const state = initFileState(fileName)
  if (!state.content && !state.loading) {
    fetchFile(fileName)
  }
})

watch(currentAgentFile, (fileName) => {
  const state = initFileState(fileName)
  if (!state.content && !state.loading) {
    fetchFile(fileName)
  }
})

onMounted(() => {
  fetchConfig()
  loadAllFiles()
})
</script>

<template>
  <div class="hermes-memory-page">
    <NTabs type="line" animated>
      <!-- 功能开关 Tab -->
      <NTabPane name="config" :tab="t('pages.hermesMemory.sections.featureToggles')">
        <div class="tab-content">
          <NCard :bordered="false" class="app-card hermes-stats-panel">
            <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="16" :y-gap="16">
              <NGridItem>
                <div class="stat-item">
                  <div class="stat-icon stat-icon--green">
                    <NIcon :component="FlashOutline" :size="20" />
                  </div>
                  <div class="stat-content">
                    <NText depth="3" class="stat-label">{{ t('pages.hermesMemory.stats.memoryStatus') }}</NText>
                    <div class="stat-value">
                      <NTag :type="memoryEnabled ? 'success' : 'default'" size="small" :bordered="false" round>
                        {{ memoryEnabled ? t('pages.hermesMemory.stats.enabled') : t('pages.hermesMemory.stats.disabled') }}
                      </NTag>
                    </div>
                  </div>
                </div>
              </NGridItem>
              <NGridItem>
                <div class="stat-item">
                  <div class="stat-icon stat-icon--blue">
                    <NIcon :component="PersonOutline" :size="20" />
                  </div>
                  <div class="stat-content">
                    <NText depth="3" class="stat-label">{{ t('pages.hermesMemory.stats.userProfileStatus') }}</NText>
                    <div class="stat-value">
                      <NTag :type="userProfileEnabled ? 'success' : 'default'" size="small" :bordered="false" round>
                        {{ userProfileEnabled ? t('pages.hermesMemory.stats.enabled') : t('pages.hermesMemory.stats.disabled') }}
                      </NTag>
                    </div>
                  </div>
                </div>
              </NGridItem>
              <NGridItem>
                <div class="stat-item">
                  <div class="stat-icon stat-icon--purple">
                    <NIcon :component="TextOutline" :size="20" />
                  </div>
                  <div class="stat-content">
                    <NText depth="3" class="stat-label">{{ t('pages.hermesMemory.stats.memoryCharLimit') }}</NText>
                    <div class="stat-value">{{ memoryCharLimit?.toLocaleString() }}</div>
                  </div>
                </div>
              </NGridItem>
              <NGridItem>
                <div class="stat-item">
                  <div class="stat-icon stat-icon--orange">
                    <NIcon :component="ServerOutline" :size="20" />
                  </div>
                  <div class="stat-content">
                    <NText depth="3" class="stat-label">{{ t('pages.hermesMemory.stats.userCharLimit') }}</NText>
                    <div class="stat-value">{{ userCharLimit?.toLocaleString() }}</div>
                  </div>
                </div>
              </NGridItem>
            </NGrid>
          </NCard>

          <NCard :bordered="false" class="app-card">
            <NSpin :show="loading">
              <NForm label-placement="left" label-width="180" :rules="formRules" :show-feedback="true">
                <div class="form-section-header">
                  <NText strong style="font-size: 14px;">{{ t('pages.hermesMemory.sections.featureToggles') }}</NText>
                  <NText depth="3" style="font-size: 12px;">{{ t('pages.hermesMemory.sections.featureTogglesDesc') }}</NText>
                </div>

                <NFormItem :label="t('pages.hermesMemory.memoryEnabled')">
                  <NSwitch v-model:value="memoryEnabled" />
                  <NText depth="3" style="margin-left: 12px; font-size: 12px;">
                    {{ t('pages.hermesMemory.memoryEnabledHint') }}
                  </NText>
                </NFormItem>

                <NFormItem :label="t('pages.hermesMemory.userProfileEnabled')">
                  <NSwitch v-model:value="userProfileEnabled" />
                  <NText depth="3" style="margin-left: 12px; font-size: 12px;">
                    {{ t('pages.hermesMemory.userProfileEnabledHint') }}
                  </NText>
                </NFormItem>

                <NDivider style="margin: 4px 0;" />

                <div class="form-section-header">
                  <NText strong style="font-size: 14px;">{{ t('pages.hermesMemory.sections.capacityLimits') }}</NText>
                  <NText depth="3" style="font-size: 12px;">{{ t('pages.hermesMemory.sections.capacityLimitsDesc') }}</NText>
                </div>

                <NFormItem :label="t('pages.hermesMemory.memoryCharLimit')" path="memoryCharLimit">
                  <NInputNumber
                    v-model:value="memoryCharLimit"
                    :min="100"
                    :max="100000"
                    :step="100"
                    style="width: 200px;"
                  />
                  <NText depth="3" style="margin-left: 12px; font-size: 12px;">
                    {{ t('pages.hermesMemory.charLimitHint') }}
                  </NText>
                </NFormItem>

                <NFormItem :label="t('pages.hermesMemory.userCharLimit')" path="userCharLimit">
                  <NInputNumber
                    v-model:value="userCharLimit"
                    :min="100"
                    :max="100000"
                    :step="100"
                    style="width: 200px;"
                  />
                  <NText depth="3" style="margin-left: 12px; font-size: 12px;">
                    {{ t('pages.hermesMemory.charLimitHint') }}
                  </NText>
                </NFormItem>

                <NDivider style="margin: 4px 0;" />

                <div class="form-section-header">
                  <NText strong style="font-size: 14px;">{{ t('pages.hermesMemory.sections.providerConfig') }}</NText>
                  <NText depth="3" style="font-size: 12px;">{{ t('pages.hermesMemory.sections.providerConfigDesc') }}</NText>
                </div>

                <NFormItem :label="t('pages.hermesMemory.provider')">
                  <NSpace vertical :size="8" style="flex: 1;">
                    <NSelect
                      v-model:value="selectedProviderValue"
                      :options="providerOptions"
                      :placeholder="t('pages.hermesMemory.providerPlaceholder')"
                      clearable
                      style="width: 300px;"
                    />
                    <NInput
                      v-if="selectedProviderValue === '__custom__'"
                      v-model:value="customProviderValue"
                      :placeholder="t('pages.hermesMemory.customProviderPlaceholder')"
                      size="small"
                      style="width: 300px;"
                      @update:value="(val: string) => provider = val"
                    />
                    <NText depth="3" style="font-size: 12px;">
                      {{ t('pages.hermesMemory.providerHint') }}
                    </NText>
                  </NSpace>
                </NFormItem>
              </NForm>
            </NSpin>

            <template #action>
              <NSpace justify="end" :size="12">
                <NButton
                  size="small"
                  class="app-toolbar-btn"
                  :disabled="!hasChanges"
                  @click="handleReset"
                >
                  <template #icon><NIcon :component="RefreshOutline" /></template>
                  {{ t('common.cancel') }}
                </NButton>
                <NButton
                  size="small"
                  class="app-toolbar-btn"
                  type="primary"
                  :disabled="!hasChanges"
                  :loading="saving"
                  @click="handleSave"
                >
                  <template #icon><NIcon :component="SaveOutline" /></template>
                  {{ t('common.save') }}
                </NButton>
              </NSpace>
            </template>
          </NCard>
        </div>
      </NTabPane>

      <!-- 用户文件 Tab -->
      <NTabPane name="userFiles" :tab="t('pages.hermesMemory.sections.userFiles')">
        <div class="tab-content">
          <NTabs type="segment" animated v-model:value="currentUserFile">
            <NTabPane v-for="file in userFiles" :key="file.name" :name="file.name" :tab="file.title">
              <FileEditor
                :file-name="file.name"
                :file-def="file"
                :state="getFileState(file.name)"
                @refresh="refreshFile(file.name)"
                @edit="startEdit(file.name)"
                @cancel="cancelEdit(file.name)"
                @save="saveFile(file.name)"
                @reset="resetEditor(file.name)"
              />
            </NTabPane>
          </NTabs>
        </div>
      </NTabPane>

      <!-- 代理文件 Tab -->
      <NTabPane name="agentFiles" :tab="t('pages.hermesMemory.sections.agentFiles')">
        <div class="tab-content">
          <NTabs type="segment" animated v-model:value="currentAgentFile">
            <NTabPane v-for="file in agentFiles" :key="file.name" :name="file.name" :tab="file.title">
              <FileEditor
                :file-name="file.name"
                :file-def="file"
                :state="getFileState(file.name)"
                @refresh="refreshFile(file.name)"
                @edit="startEdit(file.name)"
                @cancel="cancelEdit(file.name)"
                @save="saveFile(file.name)"
                @reset="resetEditor(file.name)"
              />
            </NTabPane>
          </NTabs>
        </div>
      </NTabPane>
    </NTabs>
  </div>
</template>

<script lang="ts">
// 子组件：文件编辑器
const FileEditor = {
  name: 'FileEditor',
  props: {
    fileName: { type: String, required: true },
    fileDef: { type: Object, required: true },
    state: { type: Object, required: true },
  },
  emits: ['refresh', 'edit', 'cancel', 'save', 'reset'],
  setup(props: any, { emit }: any) {
    const { t } = useI18n()
    
    const hasUnsavedChanges = computed(() => props.state.editorContent !== props.state.content)
    const charCount = computed(() => props.state.editorContent?.length || 0)
    const lineCount = computed(() => props.state.editorContent ? props.state.editorContent.split(/\r?\n/).length : 0)
    
    const previewHtml = computed(() =>
      renderSimpleMarkdown(props.state.content || '', {
        emptyHtml: `<p class="memory-markdown-empty">${t('pages.hermesMemory.files.emptyContent')}</p>`,
      })
    )
    
    const fileUpdatedText = computed(() =>
      props.state.updatedAt ? formatDate(props.state.updatedAt) : t('pages.hermesMemory.files.notCreated')
    )
    
    function formatBytes(value?: number): string {
      if (!value || value <= 0) return '-'
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      return `${(value / (1024 * 1024)).toFixed(1)} MB`
    }
    
    return () => h('div', { class: 'file-editor' }, [
      h(NCard, { class: 'memory-hero', bordered: false }, {
        header: () => h('div', { class: 'memory-hero-title' }, props.fileDef.title),
        'header-extra': () => h(NSpace, { size: 8 }, () => [
          h(NButton, { size: 'small', loading: props.state.loading, onClick: () => emit('refresh') }, {
            icon: () => h(NIcon, { component: RefreshOutline }),
            default: () => t('common.refresh'),
          }),
          !props.state.isEditing
            ? h(NButton, { size: 'small', type: 'primary', tertiary: true, onClick: () => emit('edit') }, {
                icon: () => h(NIcon, { component: CreateOutline }),
                default: () => t('pages.hermesMemory.files.edit'),
              })
            : h(NButton, { size: 'small', onClick: () => emit('cancel') }, () => t('pages.hermesMemory.files.cancelEdit')),
          props.state.isEditing
            ? h(NButton, { size: 'small', type: 'primary', loading: props.state.saving, onClick: () => emit('save') }, {
                icon: () => h(NIcon, { component: SaveOutline }),
                default: () => t('pages.hermesMemory.files.save'),
              })
            : null,
        ]),
        default: () => [
          h(NSpace, { vertical: true, size: 10 }, () => [
            h(NAlert, { type: 'info', showIcon: true, bordered: false }, () => props.fileDef.description),
          ]),
          h('div', { class: 'memory-toolbar' }, [
            h('div', { class: 'memory-stats-inline' }, [
              h('span', null, t('pages.hermesMemory.files.stats.chars', { count: charCount.value })),
              h('span', null, t('pages.hermesMemory.files.stats.lines', { count: lineCount.value })),
              h('span', null, t('pages.hermesMemory.files.stats.size', { size: formatBytes(props.state.size) })),
            ]),
            h(NSpace, { size: 6 }, () =>
              props.state.isEditing && hasUnsavedChanges.value
                ? [h(NTag, { size: 'small', type: 'warning', bordered: false, round: true }, () => t('pages.hermesMemory.files.unsaved'))]
                : []
            ),
          ]),
        ],
      }),
      h('section', { class: 'memory-layout' }, [
        h('div', { class: 'memory-main-column' }, [
          h(NCard, { class: 'memory-card', bordered: false }, {
            header: () => h('div', { class: 'memory-main-header' }, [
              h(NSpace, { size: 6, align: 'center' }, () => [
                h(NIcon, { component: DocumentTextOutline }),
                h(NText, { strong: true }, () => props.fileName),
              ]),
              h(NText, { depth: 3, style: 'font-size: 12px;' }, () => t('pages.hermesMemory.files.editor.stats', { lines: lineCount.value, chars: charCount.value })),
            ]),
            default: () => props.state.isEditing
              ? [
                  h(NInput, {
                    value: props.state.editorContent,
                    'onUpdate:value': (val: string) => { props.state.editorContent = val },
                    class: 'memory-editor',
                    type: 'textarea',
                    autosize: { minRows: 20, maxRows: 30 },
                    placeholder: t('pages.hermesMemory.files.editor.placeholder'),
                  }),
                  h('div', { class: 'memory-editor-footer' }, [
                    h(NText, { depth: 3 }, () => t('pages.hermesMemory.files.editor.saveHint')),
                    h(NSpace, { size: 8 }, () => [
                      h(NButton, { size: 'small', onClick: () => emit('reset') }, () => t('pages.hermesMemory.files.actions.restore')),
                      h(NButton, { size: 'small', onClick: () => emit('cancel') }, () => t('common.cancel')),
                      h(NButton, { size: 'small', type: 'primary', loading: props.state.saving, onClick: () => emit('save') }, () => t('common.save')),
                    ]),
                  ]),
                ]
              : [
                  h('div', { class: 'memory-markdown', innerHTML: previewHtml.value }),
                  h('div', { class: 'memory-editor-footer' }, [
                    h(NText, { depth: 3 }, () => t('pages.hermesMemory.files.readonlyHint')),
                    h(NButton, { size: 'small', type: 'primary', tertiary: true, onClick: () => emit('edit') }, {
                      icon: () => h(NIcon, { component: CreateOutline }),
                      default: () => t('pages.hermesMemory.files.edit'),
                    }),
                  ]),
                ],
          }),
          h(NCard, { class: 'memory-card', bordered: false }, {
            header: () => h(NSpace, { size: 6, align: 'center' }, () => [
              h(NIcon, { component: SparklesOutline }),
              h(NText, { strong: true }, () => t('pages.hermesMemory.files.infoCard.title')),
            ]),
            default: () => h('div', { class: 'memory-meta-grid' }, [
              h('div', { class: 'memory-meta-item' }, [
                h(NText, { depth: 3 }, () => t('pages.hermesMemory.files.infoCard.filePath')),
                h('code', null, [h(NText, null, () => props.state.path || `~/.hermes/${props.fileName}`)]),
              ]),
              h('div', { class: 'memory-meta-item' }, [
                h(NText, { depth: 3 }, () => t('pages.hermesMemory.files.infoCard.updatedAt')),
                h('div', null, () => fileUpdatedText.value),
              ]),
              h('div', { class: 'memory-meta-item' }, [
                h(NText, { depth: 3 }, () => t('pages.hermesMemory.files.infoCard.fileSize')),
                h('div', null, () => formatBytes(props.state.size)),
              ]),
              h('div', { class: 'memory-meta-item' }, [
                h(NText, { depth: 3 }, () => t('pages.hermesMemory.files.infoCard.role')),
                h('div', null, () => props.fileDef.role),
              ]),
            ]),
          }),
        ]),
      ]),
    ])
  },
}
</script>

<style scoped>
.hermes-memory-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
}

.hermes-stats-panel {
  background: linear-gradient(135deg, rgba(22, 163, 74, 0.08), rgba(59, 130, 246, 0.08));
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.stat-icon--green {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
}

.stat-icon--blue {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.stat-icon--purple {
  background: rgba(139, 92, 246, 0.12);
  color: #8b5cf6;
}

.stat-icon--orange {
  background: rgba(249, 115, 22, 0.12);
  color: #f97316;
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-label {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color-1);
  line-height: 1.3;
}

.form-section-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 12px;
  padding-top: 4px;
}

.app-toolbar-btn {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.app-toolbar-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.app-toolbar-btn:not(:disabled):active {
  transform: translateY(0);
}

/* 文件编辑器样式 */
.file-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.memory-hero {
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 84% 14%, rgba(24, 160, 88, 0.15), transparent 36%),
    linear-gradient(125deg, var(--bg-card), rgba(32, 128, 240, 0.08));
  border: 1px solid rgba(24, 160, 88, 0.14);
}

.memory-hero-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.memory-toolbar {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}

.memory-stats-inline {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 12px;
  display: flex;
  gap: 14px;
  white-space: nowrap;
  overflow: auto;
}

.memory-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.memory-main-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.memory-card {
  border-radius: var(--radius-lg);
}

.memory-main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.memory-editor :deep(.n-input__textarea-el) {
  font-size: 13px;
  line-height: 1.55;
}

.memory-markdown {
  min-height: 460px;
  max-height: min(64vh, 760px);
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  background: var(--bg-primary);
  font-size: 13.5px;
  line-height: 1.72;
  word-break: break-word;
  overflow-wrap: break-word;
}

.memory-markdown :deep(> :first-child) {
  margin-top: 0;
}

.memory-markdown :deep(> :last-child) {
  margin-bottom: 0;
}

.memory-markdown :deep(h1),
.memory-markdown :deep(h2),
.memory-markdown :deep(h3),
.memory-markdown :deep(h4),
.memory-markdown :deep(h5),
.memory-markdown :deep(h6) {
  margin: 16px 0 4px;
  line-height: 1.4;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.memory-markdown :deep(h1) { font-size: 1.35em; }
.memory-markdown :deep(h2) { font-size: 1.18em; }
.memory-markdown :deep(h3) { font-size: 1.06em; }
.memory-markdown :deep(h4) { font-size: 1em; }
.memory-markdown :deep(h5),
.memory-markdown :deep(h6) { font-size: 0.94em; }

.memory-markdown :deep(p) {
  margin: 5px 0;
  line-height: 1.72;
}

.memory-markdown :deep(ul) {
  margin: 4px 0;
  padding-left: 1.1em;
  list-style: none;
}

.memory-markdown :deep(ul > li) {
  position: relative;
  margin: 2px 0;
  line-height: 1.72;
}

.memory-markdown :deep(ul > li::before) {
  content: '';
  position: absolute;
  left: -0.88em;
  top: 0.58em;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--md-bullet-color);
}

.memory-markdown :deep(ul ul) {
  margin: 1px 0 1px 0.15em;
}

.memory-markdown :deep(ul ul > li::before) {
  width: 3.5px;
  height: 3.5px;
  background: transparent;
  border: 1px solid var(--md-bullet-nested-color);
  top: 0.62em;
}

.memory-markdown :deep(ul ul ul > li::before) {
  width: 3px;
  height: 3px;
  border: none;
  background: var(--md-bullet-nested-color);
  border-radius: 0;
}

.memory-markdown :deep(ol) {
  margin: 4px 0;
  padding-left: 1.5em;
  list-style-position: outside;
}

.memory-markdown :deep(ol > li) {
  margin: 2px 0;
  line-height: 1.72;
}

.memory-markdown :deep(ol > li::marker) {
  color: var(--md-bullet-color);
  font-size: 0.9em;
  font-weight: 500;
}

.memory-markdown :deep(a) {
  color: var(--link-color);
  text-decoration: none;
  font-weight: 500;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
  transition: color 0.12s ease, text-decoration-color 0.12s ease;
  text-decoration-line: underline;
  text-decoration-color: var(--link-underline);
}

.memory-markdown :deep(a:hover) {
  color: var(--link-color-hover);
  text-decoration-color: var(--link-color-hover);
}

.memory-markdown :deep(blockquote) {
  margin: 6px 0;
  padding: 4px 10px;
  border-left: 2.5px solid var(--md-blockquote-border);
  border-radius: 0 4px 4px 0;
  background: var(--md-blockquote-bg);
}

.memory-markdown :deep(blockquote p) {
  margin: 2px 0;
  color: var(--text-secondary);
  font-size: 0.94em;
}

.memory-markdown :deep(pre) {
  margin: 6px 0;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--md-code-border);
  background: var(--md-pre-bg);
  overflow-x: auto;
  line-height: 1.52;
}

.memory-markdown :deep(code) {
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  font-size: 0.87em;
}

.memory-markdown :deep(p code),
.memory-markdown :deep(li code) {
  padding: 0.5px 4.5px;
  border-radius: 3px;
  border: 1px solid var(--md-code-border);
  background: var(--md-code-bg);
}

.memory-markdown :deep(hr) {
  border: 0;
  height: 1px;
  background: var(--border-color);
  margin: 10px 0;
}

.memory-markdown :deep(strong) {
  font-weight: 600;
}

.memory-markdown :deep(em) {
  font-style: italic;
}

.memory-markdown-empty {
  color: var(--text-secondary);
}

.memory-editor-footer {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.memory-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.memory-meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.memory-meta-item code {
  display: inline-block;
  min-width: 0;
}

@media (max-width: 1024px) {
  .memory-toolbar {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .memory-stats-inline {
    gap: 10px;
  }

  .memory-main-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .memory-meta-grid {
    grid-template-columns: 1fr;
  }

  .memory-editor-footer {
    flex-direction: column;
    align-items: stretch;
  }
}

[data-theme='dark'] .memory-markdown :deep(.code-line-numbers) {
  background: rgba(255, 255, 255, 0.03);
}
</style>
