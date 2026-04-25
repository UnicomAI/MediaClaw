<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NCode,
  NDataTable,
  NDivider,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns, SelectOption } from 'naive-ui'
import {
  AddOutline,
  CalendarOutline,
  CheckmarkCircleOutline,
  EyeOutline,
  PauseCircleOutline,
  PlayOutline,
  RefreshOutline,
  TimeOutline,
  TrashOutline,
  CreateOutline,
  SearchOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useCronStore } from '@/stores/cron'
import { useConfigStore } from '@/stores/config'
import { useModelStore } from '@/stores/model'
import { useSessionStore } from '@/stores/session'
import type {
  CronDelivery,
  CronJob,
  ModelInfo,
  CronPayload,
  CronRunLogEntry,
  CronSchedule,
  CronUpsertParams,
} from '@/api/types'
import { formatDate, formatRelativeTime, parseSessionKey, truncate } from '@/utils/format'
import { renderSimpleMarkdown } from '@/utils/markdown'

type ScheduleKind = 'cron' | 'every' | 'at'
type EveryUnit = 'minutes' | 'hours' | 'days'
type StatusFilter = 'all' | 'enabled' | 'disabled'
type ParsedModelRef = {
  modelRef: string
  providerId: string
  modelId: string
}
type CronTemplatePreset = {
  id: string
  label: string
  description: string
  scheduleKind: ScheduleKind
  cronExpr?: string
  everyValue?: number
  everyUnit?: EveryUnit
  payloadText: string
  payloadKind?: 'systemEvent' | 'agentTurn'
  sessionTarget?: 'main' | 'isolated'
  deliveryMode?: 'none' | 'announce'
}

const cronStore = useCronStore()
const configStore = useConfigStore()
const modelStore = useModelStore()
const sessionStore = useSessionStore()
const router = useRouter()
const message = useMessage()
const { t, locale } = useI18n()

const showModal = ref(false)
const showDetailModal = ref(false)
const showRunDetailModal = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingJobId = ref('')
const searchQuery = ref('')
const statusFilter = ref<StatusFilter>('all')
const selectedRun = ref<CronRunLogEntry | null>(null)

const quickTemplatePresets = computed<CronTemplatePreset[]>(() => [
  {
    id: 'morning-report',
    label: t('pages.cron.templates.morningReport.label'),
    description: t('pages.cron.templates.morningReport.description'),
    scheduleKind: 'cron',
    cronExpr: '0 8 * * *',
    payloadText: t('pages.cron.templates.morningReport.payloadText'),
    payloadKind: 'agentTurn',
    sessionTarget: 'isolated',
    deliveryMode: 'announce',
  },
  {
    id: 'heartbeat-check',
    label: t('pages.cron.templates.heartbeatCheck.label'),
    description: t('pages.cron.templates.heartbeatCheck.description'),
    scheduleKind: 'every',
    everyValue: 30,
    everyUnit: 'minutes',
    payloadText: t('pages.cron.templates.heartbeatCheck.payloadText'),
    payloadKind: 'agentTurn',
    sessionTarget: 'isolated',
    deliveryMode: 'announce',
  },
  {
    id: 'main-reminder',
    label: t('pages.cron.templates.mainReminder.label'),
    description: t('pages.cron.templates.mainReminder.description'),
    scheduleKind: 'cron',
    cronExpr: '0 21 * * *',
    payloadText: t('pages.cron.templates.mainReminder.payloadText'),
    payloadKind: 'systemEvent',
    sessionTarget: 'main',
    deliveryMode: 'none',
  },
])

const scheduleKindOptions = computed<Array<{ label: string; value: ScheduleKind }>>(() => [
  { label: t('pages.cron.scheduleKinds.cron'), value: 'cron' },
  { label: t('pages.cron.scheduleKinds.every'), value: 'every' },
  { label: t('pages.cron.scheduleKinds.at'), value: 'at' },
])

const everyUnitOptions = computed<Array<{ label: string; value: EveryUnit }>>(() => [
  { label: t('pages.cron.units.minutes'), value: 'minutes' },
  { label: t('pages.cron.units.hours'), value: 'hours' },
  { label: t('pages.cron.units.days'), value: 'days' },
])

const deliveryChannelLabelMap: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  mattermost: 'Mattermost',
  signal: 'Signal',
  imessage: 'iMessage',
  qqbot: 'QQ Bot',
  qq: 'QQ',
}

const form = reactive({
  name: '',
  description: '',
  agentId: '',
  enabled: true,
  deleteAfterRun: false,

  scheduleKind: 'cron' as ScheduleKind,
  cronExpr: '0 7 * * *',
  cronTz: '',
  everyValue: 1,
  everyUnit: 'hours' as EveryUnit,
  atTime: '',

  sessionTarget: 'isolated' as 'main' | 'isolated',
  wakeMode: 'next-heartbeat' as 'next-heartbeat' | 'now',

  payloadKind: 'agentTurn' as 'systemEvent' | 'agentTurn',
  payloadText: '',
  model: '',
  thinking: '',
  timeoutSeconds: 120,

  deliveryMode: 'announce' as 'none' | 'announce',
  deliveryChannel: 'last',
  deliveryTo: '',
  deliveryBestEffort: true,
})

const isEditing = computed(() => modalMode.value === 'edit')
const filteredJobs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return cronStore.jobs.filter((job) => {
    if (statusFilter.value === 'enabled' && !job.enabled) return false
    if (statusFilter.value === 'disabled' && job.enabled) return false
    if (!query) return true

    return [
      job.name,
      job.description || '',
      job.schedule || '',
      job.agentId || '',
      job.payload?.kind || '',
      job.payload?.kind === 'agentTurn' ? job.payload.message : '',
      job.payload?.kind === 'systemEvent' ? job.payload.text : '',
      job.delivery?.channel || '',
      job.delivery?.to || '',
    ].some((field) => field.toLowerCase().includes(query))
  })
})

const hasJobs = computed(() => cronStore.jobs.length > 0)

const selectedJob = computed(() =>
  cronStore.jobs.find((job) => job.id === cronStore.selectedJobId) || null
)

const defaultModelRef = computed(() => {
  const fromModelsPrimary = configStore.config?.models?.primary?.trim() || ''
  if (fromModelsPrimary) return fromModelsPrimary
  const fromAgentPrimary = configStore.config?.agents?.defaults?.model?.primary?.trim() || ''
  if (fromAgentPrimary) return fromAgentPrimary
  return configuredModelRefs.value[0] || ''
})

const selectedJobModelText = computed(() => {
  const payload = selectedJob.value?.payload
  if (!payload || payload.kind !== 'agentTurn') return '-'
  const overrideModel = payload.model?.trim() || ''
  if (overrideModel) return overrideModel
  return defaultModelRef.value
    ? t('pages.cron.defaultModel', { model: defaultModelRef.value })
    : t('pages.cron.defaultModelNotConfigured')
})

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function normalizeChannelKey(value: string): string {
  return value.trim().toLowerCase()
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => !!item && item !== '*')
}

function isConfiguredChannelEnabled(value: unknown): boolean {
  const row = toRecord(value)
  if (!row) return false
  return row.enabled !== false
}

function formatDeliveryChannelLabel(channelKey: string): string {
  const normalized = normalizeChannelKey(channelKey)
  if (normalized === 'last') return t('pages.cron.delivery.last')
  if (normalized === 'qqbot') return t('pages.cron.delivery.channels.qqbot')
  if (normalized === 'qq') return t('pages.cron.delivery.channels.qq')
  if (normalized === 'wecom') return t('pages.cron.delivery.channels.wecom')
  if (normalized === 'wechat') return t('pages.cron.delivery.channels.wechat')
  if (normalized === 'dingtalk') return t('pages.cron.delivery.channels.dingtalk')
  if (normalized === 'feishu') return t('pages.cron.delivery.channels.feishu')
  return deliveryChannelLabelMap[normalized] || normalized
}

function collectConfiguredTargets(input: unknown, output: Set<string>) {
  const row = toRecord(input)
  if (!row) return

  for (const target of asStringArray(row.allowFrom)) {
    output.add(target)
  }
  for (const target of asStringArray(row.groupAllowFrom)) {
    output.add(target)
  }

  const groups = toRecord(row.groups)
  if (!groups) return

  for (const [groupId, groupValue] of Object.entries(groups)) {
    const normalizedGroupId = groupId.trim()
    if (!normalizedGroupId) continue
    output.add(normalizedGroupId)

    const groupRow = toRecord(groupValue)
    const topics = toRecord(groupRow?.topics)
    if (!topics) continue
    for (const topicId of Object.keys(topics)) {
      const normalizedTopicId = topicId.trim()
      if (!normalizedTopicId) continue
      output.add(`${normalizedGroupId}:topic:${normalizedTopicId}`)
    }
  }
}

const configuredChannelConfigMap = computed<Record<string, unknown>>(() => {
  const source = toRecord(configStore.config?.channels)
  const map: Record<string, unknown> = {}
  if (!source) return map
  for (const [channelKey, channelValue] of Object.entries(source)) {
    const normalized = normalizeChannelKey(channelKey)
    if (!normalized) continue
    map[normalized] = channelValue
  }
  return map
})

const deliveryChannelOptions = computed<SelectOption[]>(() => {
  const options: SelectOption[] = [{ label: t('pages.cron.delivery.last'), value: 'last' }]
  const seen = new Set<string>(['last'])
  const channels = configuredChannelConfigMap.value
  if (channels) {
    const configured = Object.entries(channels)
      .filter(([, value]) => isConfiguredChannelEnabled(value))
      .map(([channelKey]) => channelKey.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))

    for (const channelKey of configured) {
      const normalized = normalizeChannelKey(channelKey)
      if (seen.has(normalized)) continue
      seen.add(normalized)
      options.push({
        label: formatDeliveryChannelLabel(channelKey),
        value: channelKey,
      })
    }
  }

  const currentValue = form.deliveryChannel.trim()
  const currentKey = normalizeChannelKey(currentValue)
  if (currentValue && !seen.has(currentKey)) {
    options.push({
      label: t('common.currentValueSuffix', { label: formatDeliveryChannelLabel(currentValue) }),
      value: currentValue,
    })
  }

  return options
})

const deliveryTargetOptions = computed<SelectOption[]>(() => {
  const targetSet = new Set<string>()
  const options: SelectOption[] = []
  const channelKey = normalizeChannelKey(form.deliveryChannel)
  if (channelKey && channelKey !== 'last') {
    const channelConfig = configuredChannelConfigMap.value[channelKey]
    collectConfiguredTargets(channelConfig, targetSet)

    const row = toRecord(channelConfig)
    const accounts = toRecord(row?.accounts)
    if (accounts) {
      for (const accountConfig of Object.values(accounts)) {
        collectConfiguredTargets(accountConfig, targetSet)
      }
    }

    for (const session of sessionStore.sessions) {
      const parsed = parseSessionKey(session.key)
      const sessionChannel = normalizeChannelKey(session.channel || parsed.channel)
      if (sessionChannel !== channelKey) continue

      const peers = [session.peer, parsed.peer]
        .map((item) => item?.trim() || '')
        .filter(Boolean)

      const hasPrefixedPeer = peers.some((peer) => peer.includes(':'))
      for (const peer of peers) {
        if (hasPrefixedPeer && !peer.includes(':')) continue
        targetSet.add(peer)
      }

      if (channelKey === 'qqbot') {
        const key = session.key.toLowerCase()
        const qqTargetPrefix = key.includes(':group:') || key.includes(':channel:') ? 'group' : 'user'
        for (const peer of peers) {
          if (!peer || peer.includes(':')) continue
          targetSet.add(`${qqTargetPrefix}:${peer}`)
        }
      }
    }
  }

  for (const target of Array.from(targetSet).sort((a, b) => a.localeCompare(b))) {
    options.push({ label: target, value: target })
  }

  const current = form.deliveryTo.trim()
  if (current && !targetSet.has(current)) {
    options.unshift({
      label: t('common.currentValueSuffix', { label: current }),
      value: current,
    })
  }

  return options
})

function splitModelRef(value: string): ParsedModelRef | null {
  const text = value.trim()
  const slashIndex = text.indexOf('/')
  if (slashIndex <= 0 || slashIndex >= text.length - 1) return null
  const providerId = text.slice(0, slashIndex).trim()
  const modelId = text.slice(slashIndex + 1).trim()
  if (!providerId || !modelId) return null
  return {
    modelRef: `${providerId}/${modelId}`,
    providerId,
    modelId,
  }
}

function collectConfiguredModelRefs(input: unknown, refs: Set<string>) {
  if (!input) return

  if (typeof input === 'string') {
    const parsed = splitModelRef(input)
    if (parsed) refs.add(parsed.modelRef)
    return
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      collectConfiguredModelRefs(item, refs)
    }
    return
  }

  const row = toRecord(input)
  if (!row) return

  for (const candidate of [row.id, row.model, row.ref, row.primary]) {
    if (typeof candidate === 'string') {
      const parsed = splitModelRef(candidate)
      if (parsed) refs.add(parsed.modelRef)
    }
  }

  for (const [key, value] of Object.entries(row)) {
    const keyParsed = splitModelRef(key)
    if (keyParsed) refs.add(keyParsed.modelRef)
    if (typeof value === 'string') {
      const valueParsed = splitModelRef(value)
      if (valueParsed) refs.add(valueParsed.modelRef)
    }
  }
}

const configuredModelRefs = computed<string[]>(() => {
  const refs = new Set<string>()
  const defaultsRaw = toRecord(configStore.config?.agents?.defaults)
  const defaultsModelRaw = toRecord(defaultsRaw?.model)
  collectConfiguredModelRefs(configStore.config?.models?.primary, refs)
  collectConfiguredModelRefs(configStore.config?.models?.fallback, refs)
  collectConfiguredModelRefs(defaultsRaw?.models, refs)
  collectConfiguredModelRefs(defaultsModelRaw?.primary, refs)
  collectConfiguredModelRefs(defaultsModelRaw?.fallback, refs)
  collectConfiguredModelRefs(defaultsModelRaw?.fallbacks, refs)
  return Array.from(refs).sort((a, b) => a.localeCompare(b))
})

const runtimeModelMap = computed<Map<string, ModelInfo>>(() => {
  const map = new Map<string, ModelInfo>()
  for (const model of modelStore.models) {
    if (model.available === false) continue
    const modelId = model.id.trim()
    if (!modelId) continue
    if (!map.has(modelId)) {
      map.set(modelId, model)
    }
    const providerId = model.provider?.trim()
    if (!providerId) continue
    const modelRef = `${providerId}/${modelId}`
    if (!map.has(modelRef)) {
      map.set(modelRef, model)
    }
  }
  return map
})

const runtimeModelOptions = computed<SelectOption[]>(() => {
  const seen = new Set<string>()
  return [...modelStore.models]
    .filter((item) => item.available !== false)
    .sort((a, b) => {
      const left = `${a.provider || ''}/${a.id}`
      const right = `${b.provider || ''}/${b.id}`
      return left.localeCompare(right)
    })
    .flatMap((item) => {
      const id = item.id.trim()
      if (!id || seen.has(id)) return []
      seen.add(id)
      return [
        {
          label: formatModelOptionLabel(item),
          value: id,
        },
      ]
    })
})

const configuredModelOptions = computed<SelectOption[]>(() => {
  return configuredModelRefs.value.map((modelRef) => {
    const runtime = resolveRuntimeModel(modelRef)
    return {
      label: formatConfiguredModelOptionLabel(modelRef, runtime),
      value: modelRef,
    }
  })
})

const modelSelectOptions = computed<SelectOption[]>(() => {
  const options =
    configuredModelOptions.value.length > 0
      ? [...configuredModelOptions.value]
      : [...runtimeModelOptions.value]
  const current = form.model.trim()
  if (current && !options.some((option) => option.value === current)) {
    options.unshift({
      label: t('common.currentValueSuffix', { label: current }),
      value: current,
    })
  }
  return options
})

const selectedJobPayloadText = computed(() => {
  const payload = selectedJob.value?.payload
  if (!payload) return ''
  if (payload.kind === 'systemEvent') return payload.text || ''
  if (payload.kind === 'agentTurn') return payload.message || ''
  return ''
})

const selectedJobPayloadHtml = computed(() => {
  const text = selectedJobPayloadText.value.trim()
  if (!text) return ''
  return renderSimpleMarkdown(text)
})

const orderedRuns = computed(() => [...cronStore.runs].sort((a, b) => b.ts - a.ts))
const selectedRunRaw = computed(() => {
  if (!selectedRun.value) return ''
  return JSON.stringify(selectedRun.value, null, 2)
})
const selectedRunStatusType = computed<'success' | 'error' | 'warning' | 'default'>(() => {
  return resolveRunStatusType(selectedRun.value?.status)
})

const stats = computed(() => {
  const total = cronStore.jobs.length
  const enabled = cronStore.jobs.filter((job) => job.enabled).length
  const disabled = total - enabled
  const nextWakeAtMs = cronStore.status?.nextWakeAtMs
  return {
    schedulerEnabled: cronStore.status?.enabled ?? true,
    total,
    enabled,
    disabled,
    nextWakeText: nextWakeAtMs ? formatDate(nextWakeAtMs) : '-',
  }
})

function resolveRunStatusType(status?: string): 'success' | 'error' | 'warning' | 'default' {
  if (status === 'ok') return 'success'
  if (status === 'error') return 'error'
  if (status === 'skipped') return 'warning'
  return 'default'
}

function formatDurationSeconds(durationMs?: number): string {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
    return '-'
  }
  const secondsText = (durationMs / 1000).toFixed(2).replace(/\.?0+$/, '')
  return `${secondsText}s`
}

const previewPayload = computed(() => {
  try {
    const payload = buildSubmitPayload()
    return JSON.stringify(payload, null, 2)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return t('pages.cron.previewUnavailable', { error: msg })
  }
})

const jobColumns = computed<DataTableColumns<CronJob>>(() => [
  {
    title: t('pages.cron.table.jobs.task'),
    key: 'name',
    minWidth: 192,
    render(row) {
      return h(NSpace, { size: 6, align: 'center', wrap: false }, () => [
        h(
          NText,
          { strong: true, style: 'font-size: 13px; line-height: 1.3;' },
          { default: () => row.name }
        ),
        row.id === cronStore.selectedJobId
          ? h(
              NTag,
              { size: 'tiny', bordered: false, type: 'success' },
              { default: () => t('pages.cron.table.jobs.selected') }
            )
          : null,
      ])
    },
  },
  {
    title: t('pages.cron.table.jobs.schedule'),
    key: 'schedule',
    minWidth: 176,
    render(row) {
      return h(NSpace, { vertical: true, size: 2 }, () => [
        h('code', { style: 'font-size: 10px; line-height: 1.3;' }, resolveScheduleText(row)),
        h(
          NSpace,
          { size: 4 },
          () => [
            row.sessionTarget
              ? h(
                  NTag,
                  { size: 'tiny', bordered: false, type: row.sessionTarget === 'isolated' ? 'info' : 'default', round: true },
                  { default: () => row.sessionTarget === 'isolated' ? t('pages.cron.sessionTargets.isolated') : t('pages.cron.sessionTargets.main') }
                )
              : null,
            row.payload
              ? h(
                  NTag,
                  { size: 'tiny', bordered: false, type: row.payload.kind === 'agentTurn' ? 'success' : 'warning', round: true },
                  { default: () => row.payload?.kind === 'agentTurn' ? t('pages.cron.payloadKinds.agentTurn') : t('pages.cron.payloadKinds.systemEvent') }
                )
              : null,
          ].filter(Boolean)
        ),
      ])
    },
  },
  {
    title: t('pages.cron.table.jobs.nextRun'),
    key: 'next',
    width: 126,
    render(row) {
      return nextRunText(row)
    },
  },
  {
    title: t('pages.cron.table.jobs.status'),
    key: 'enabled',
    width: 92,
    render(row) {
      return h(NSwitch, {
        size: 'small',
        value: row.enabled,
        loading: cronStore.saving,
        'onUpdate:value': (value: boolean) => {
          void handleToggle(row, value)
        },
      })
    },
  },
  {
    title: t('pages.cron.table.jobs.actions'),
    key: 'actions',
    width: 336,
    render(row) {
      return h(NSpace, { size: 8, wrap: false, class: 'cron-job-actions' }, () => [
        h(
          NButton,
          {
            size: 'small',
            type: 'info',
            secondary: true,
            strong: true,
            class: 'cron-action-btn cron-action-btn--detail',
            onClick: (e: MouseEvent) => {
              e.stopPropagation()
              openDetailModal(row)
            },
          },
          {
            icon: () => h(NIcon, { component: EyeOutline }),
            default: () => t('pages.cron.actions.viewDetail'),
          }
        ),
        h(
          NButton,
          {
            size: 'small',
            type: 'success',
            secondary: true,
            strong: true,
            class: 'cron-action-btn cron-action-btn--run',
            onClick: (e: MouseEvent) => {
              e.stopPropagation()
              void handleRun(row)
            },
          },
          {
            icon: () => h(NIcon, { component: PlayOutline }),
            default: () => t('pages.cron.actions.run'),
          }
        ),
        h(
          NButton,
          {
            size: 'small',
            type: 'info',
            secondary: true,
            strong: true,
            class: 'cron-action-btn cron-action-btn--edit',
            onClick: (e: MouseEvent) => {
              e.stopPropagation()
              openEditModal(row)
            },
          },
          {
            icon: () => h(NIcon, { component: CreateOutline }),
            default: () => t('pages.cron.actions.edit'),
          }
        ),
        h(
          NPopconfirm,
          {
            onPositiveClick: () => handleDelete(row),
            positiveText: t('common.delete'),
            negativeText: t('common.cancel'),
          },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: 'small',
                  type: 'error',
                  secondary: true,
                  strong: true,
                  class: 'cron-action-btn cron-action-btn--delete',
                  onClick: (e: MouseEvent) => e.stopPropagation(),
                },
                {
                  icon: () => h(NIcon, { component: TrashOutline }),
                  default: () => t('common.delete'),
                }
              ),
            default: () => t('pages.cron.confirmDeleteJob'),
          }
        ),
      ])
    },
  },
])

const runColumns = computed<DataTableColumns<CronRunLogEntry>>(() => [
  {
    title: t('pages.cron.table.runs.runAt'),
    key: 'ts',
    width: 170,
    render(row) {
      return formatDate(row.ts)
    },
  },
  {
    title: t('pages.cron.table.runs.status'),
    key: 'status',
    width: 100,
    render(row) {
      const status = row.status || 'unknown'
      const type = resolveRunStatusType(status)
      return h(NTag, { size: 'small', bordered: false, type }, { default: () => status })
    },
  },
  {
    title: t('pages.cron.table.runs.duration'),
    key: 'durationMs',
    width: 90,
    render(row) {
      return formatDurationSeconds(row.durationMs)
    },
  },
  {
    title: t('pages.cron.table.runs.summary'),
    key: 'summary',
    minWidth: 260,
    render(row) {
      return truncate(row.summary || row.error || '-', 96)
    },
  },
  {
    title: t('pages.cron.table.runs.session'),
    key: 'sessionKey',
    width: 100,
    render(row) {
      if (!row.sessionKey) return '-'
      return h(
        NButton,
        {
          text: true,
          type: 'primary',
          onClick: (e: MouseEvent) => {
            e.stopPropagation()
            openRunSession(row)
          },
        },
        { default: () => t('pages.cron.actions.openSession') }
      )
    },
  },
])

onMounted(async () => {
  await Promise.all([
    cronStore.fetchOverview(),
    modelStore.fetchModels(),
    configStore.fetchConfig(),
    sessionStore.fetchSessions(),
  ])
  const firstJob = cronStore.jobs[0]
  if (firstJob) {
    await cronStore.fetchRuns(firstJob.id)
  }
})

function formatModelOptionLabel(model: ModelInfo): string {
  const suffix = locale.value === 'zh-CN' ? `（${model.id}）` : ` (${model.id})`
  const base = model.label && model.label !== model.id ? `${model.label}${suffix}` : model.id
  if (!model.provider) return base
  return `${base} · ${model.provider}`
}

function resolveRuntimeModel(modelRef: string): ModelInfo | null {
  const byExactRef = runtimeModelMap.value.get(modelRef)
  if (byExactRef) return byExactRef
  const parsed = splitModelRef(modelRef)
  if (!parsed) return null
  return runtimeModelMap.value.get(parsed.modelId) || null
}

function formatConfiguredModelOptionLabel(modelRef: string, model: ModelInfo | null): string {
  if (!model) return modelRef
  const readable = model.label && model.label !== model.id ? model.label : ''
  if (!readable) return modelRef
  return `${modelRef} · ${readable}`
}

watch(
  () => form.sessionTarget,
  (target) => {
    if (target === 'main') {
      form.payloadKind = 'systemEvent'
      form.deliveryMode = 'none'
      return
    }
    if (form.payloadKind === 'systemEvent') {
      form.payloadKind = 'agentTurn'
    }
    if (form.deliveryMode === 'none') {
      form.deliveryMode = 'announce'
    }
  }
)

watch(
  () => form.payloadKind,
  (payloadKind) => {
    if (payloadKind === 'systemEvent') {
      form.deliveryMode = 'none'
    }
  }
)

watch(
  () => defaultModelRef.value,
  (modelRef) => {
    if (!showModal.value || !modelRef) return
    if (form.payloadKind !== 'agentTurn') return
    if (form.model.trim()) return
    form.model = modelRef
  }
)

function resetForm() {
  form.name = ''
  form.description = ''
  form.agentId = ''
  form.enabled = true
  form.deleteAfterRun = false
  form.scheduleKind = 'cron'
  form.cronExpr = '0 7 * * *'
  form.cronTz = ''
  form.everyValue = 1
  form.everyUnit = 'hours'
  form.atTime = ''
  form.sessionTarget = 'isolated'
  form.wakeMode = 'next-heartbeat'
  form.payloadKind = 'agentTurn'
  form.payloadText = ''
  form.model = defaultModelRef.value || ''
  form.thinking = ''
  form.timeoutSeconds = 120
  form.deliveryMode = 'announce'
  form.deliveryChannel = 'last'
  form.deliveryTo = ''
  form.deliveryBestEffort = true
}

function openCreateModal() {
  modalMode.value = 'create'
  editingJobId.value = ''
  resetForm()
  showModal.value = true
}

function applyQuickTemplate(preset: CronTemplatePreset) {
  openCreateModal()
  form.name = preset.label
  form.description = preset.description
  form.scheduleKind = preset.scheduleKind

  if (preset.scheduleKind === 'cron') {
    form.cronExpr = preset.cronExpr || '0 8 * * *'
  } else if (preset.scheduleKind === 'every') {
    form.everyValue = preset.everyValue || 1
    form.everyUnit = preset.everyUnit || 'hours'
  }

  form.sessionTarget = preset.sessionTarget || 'isolated'
  form.payloadKind = preset.payloadKind || 'agentTurn'
  form.payloadText = preset.payloadText
  form.deliveryMode = preset.deliveryMode || (form.sessionTarget === 'main' ? 'none' : 'announce')
}

function openEditModal(job: CronJob) {
  modalMode.value = 'edit'
  editingJobId.value = job.id
  fillFormByJob(job)
  showModal.value = true
}

function fillFormByJob(job: CronJob) {
  resetForm()
  form.name = job.name
  form.description = job.description || ''
  form.agentId = job.agentId || ''
  form.enabled = job.enabled
  form.deleteAfterRun = job.deleteAfterRun === true

  const schedule = job.scheduleObj
  if (schedule?.kind === 'cron') {
    form.scheduleKind = 'cron'
    form.cronExpr = schedule.expr
    form.cronTz = schedule.tz || ''
  } else if (schedule?.kind === 'every') {
    form.scheduleKind = 'every'
    const every = resolveEveryForm(schedule.everyMs)
    form.everyValue = every.value
    form.everyUnit = every.unit
  } else if (schedule?.kind === 'at') {
    form.scheduleKind = 'at'
    form.atTime = toDatetimeLocal(schedule.at)
  } else {
    form.scheduleKind = 'cron'
    form.cronExpr = job.schedule || '0 7 * * *'
    form.cronTz = job.timezone || ''
  }

  form.sessionTarget = job.sessionTarget || 'isolated'
  form.wakeMode = job.wakeMode || 'next-heartbeat'

  if (job.payload?.kind === 'systemEvent') {
    form.payloadKind = 'systemEvent'
    form.payloadText = job.payload.text
  } else {
    form.payloadKind = 'agentTurn'
    form.payloadText = job.payload?.kind === 'agentTurn' ? job.payload.message : ''
    form.model = job.payload?.kind === 'agentTurn'
      ? (job.payload.model || defaultModelRef.value || '')
      : ''
    form.thinking = job.payload?.kind === 'agentTurn' ? (job.payload.thinking || '') : ''
    form.timeoutSeconds = job.payload?.kind === 'agentTurn'
      ? (job.payload.timeoutSeconds || 120)
      : 120
  }

  form.deliveryMode = job.delivery?.mode || (form.sessionTarget === 'isolated' ? 'announce' : 'none')
  form.deliveryChannel = job.delivery?.channel || 'last'
  form.deliveryTo = job.delivery?.to || ''
  form.deliveryBestEffort = job.delivery?.bestEffort !== false
}

function toDatetimeLocal(value?: string): string {
  if (!value) return ''
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000)
  return date.toISOString().slice(0, 16)
}

function resolveEveryForm(everyMs: number): { value: number; unit: EveryUnit } {
  if (everyMs % 86_400_000 === 0) {
    return { value: everyMs / 86_400_000, unit: 'days' }
  }
  if (everyMs % 3_600_000 === 0) {
    return { value: everyMs / 3_600_000, unit: 'hours' }
  }
  return { value: Math.max(1, Math.round(everyMs / 60_000)), unit: 'minutes' }
}

function buildSchedule(): CronSchedule {
  if (form.scheduleKind === 'cron') {
    const expr = form.cronExpr.trim()
    if (!expr) throw new Error(t('pages.cron.validation.cronExprRequired'))
    return {
      kind: 'cron',
      expr,
      tz: form.cronTz.trim() || undefined,
    }
  }

  if (form.scheduleKind === 'every') {
    const amount = Number(form.everyValue)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(t('pages.cron.validation.everyValueInvalid'))
    }
    const multiplier =
      form.everyUnit === 'days'
        ? 86_400_000
        : form.everyUnit === 'hours'
          ? 3_600_000
          : 60_000
    return {
      kind: 'every',
      everyMs: Math.round(amount * multiplier),
    }
  }

  const atMs = Date.parse(form.atTime)
  if (!form.atTime || !Number.isFinite(atMs)) {
    throw new Error(t('pages.cron.validation.atTimeRequired'))
  }
  return {
    kind: 'at',
    at: new Date(atMs).toISOString(),
  }
}

function buildPayload(): CronPayload {
  const text = form.payloadText.trim()
  if (!text) throw new Error(t('pages.cron.validation.payloadRequired'))

  if (form.sessionTarget === 'main' || form.payloadKind === 'systemEvent') {
    return {
      kind: 'systemEvent',
      text,
    }
  }

  const timeout = Number(form.timeoutSeconds)
  return {
    kind: 'agentTurn',
    message: text,
    model: form.model.trim() || undefined,
    thinking: form.thinking.trim() || undefined,
    timeoutSeconds: Number.isFinite(timeout) && timeout > 0 ? Math.round(timeout) : undefined,
  }
}

function buildDelivery(): CronDelivery | undefined {
  if (form.sessionTarget !== 'isolated' || form.payloadKind !== 'agentTurn') {
    return undefined
  }
  if (form.deliveryMode === 'none') {
    return { mode: 'none' }
  }
  return {
    mode: 'announce',
    channel: form.deliveryChannel.trim() || 'last',
    to: form.deliveryTo.trim() || undefined,
    bestEffort: form.deliveryBestEffort,
  }
}

function buildSubmitPayload(): CronUpsertParams {
  const name = form.name.trim()
  if (!name) throw new Error(t('pages.cron.validation.nameRequired'))

  const payload: CronUpsertParams = {
    name,
    description: form.description.trim() || undefined,
    enabled: form.enabled,
    deleteAfterRun: form.deleteAfterRun,
    schedule: buildSchedule(),
    sessionTarget: form.sessionTarget,
    wakeMode: form.wakeMode,
    payload: buildPayload(),
    delivery: buildDelivery(),
  }

  const agentId = form.agentId.trim()
  if (isEditing.value) {
    payload.agentId = agentId || null
  } else if (agentId) {
    payload.agentId = agentId
  }

  return payload
}

function clearFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
}

function parseCronSource(text: string): { expr: string; tz?: string } {
  const value = text.trim()
  const match = value.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
  if (!match) return { expr: value }
  return {
    expr: match[1]?.trim() || value,
    tz: match[2]?.trim() || undefined,
  }
}

function parseNumberList(value: string, min: number, max: number): number[] | null {
  if (!/^\d+(,\d+)+$/.test(value)) return null
  const list = value
    .split(',')
    .map((item) => Number(item))
    .filter((num) => Number.isInteger(num) && num >= min && num <= max)
  if (list.length === 0) return null
  return Array.from(new Set(list)).sort((a, b) => a - b)
}

function parseNumberRange(value: string, min: number, max: number): { start: number; end: number } | null {
  const match = value.match(/^(\d+)-(\d+)$/)
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  if (start < min || start > max || end < min || end > max || start > end) return null
  return { start, end }
}

function isHalfHourMinuteRule(minute: string, minuteList: number[] | null): boolean {
  if (minute.trim() === '*/30') return true
  return !!minuteList && minuteList.length === 2 && minuteList[0] === 0 && minuteList[1] === 30
}

function formatCronAsCn(expr: string, tz?: string): string {
  const compactExpr = expr.trim().replace(/\s+/g, ' ')
  const parts = compactExpr.split(' ')
  const tzSuffix = tz ? `（${tz}）` : ''
  if (parts.length !== 5) return `${compactExpr}${tzSuffix}`

  const minute = parts[0] ?? ''
  const hour = parts[1] ?? ''
  const dayOfMonth = parts[2] ?? ''
  const month = parts[3] ?? ''
  const dayOfWeek = parts[4] ?? ''
  const isNumber = (value: string) => /^\d+$/.test(value)
  const asNum = (value: string) => (isNumber(value) ? Number(value) : NaN)
  const pad2 = (value: number) => String(value).padStart(2, '0')
  const minuteList = parseNumberList(minute, 0, 59)
  const hourRange = parseNumberRange(hour, 0, 23)
  const minuteMarks = minuteList?.map((num) => `${pad2(num)} 分`).join('、') || ''
  const isHalfHour = isHalfHourMinuteRule(minute, minuteList)

  if (isHalfHour && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `每半小时${tzSuffix}`
  }

  if (/^\*\/\d+$/.test(minute) && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `每 ${minute.slice(2)} 分钟${tzSuffix}`
  }

  if (minuteList && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `每小时的 ${minuteMarks}${tzSuffix}`
  }

  if (minute === '0' && /^\*\/\d+$/.test(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `每 ${hour.slice(2)} 小时${tzSuffix}`
  }

  if (isNumber(minute) && /^\*\/\d+$/.test(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `每 ${hour.slice(2)} 小时的 ${pad2(asNum(minute))} 分${tzSuffix}`
  }

  if (/^\*\/\d+$/.test(minute) && hourRange && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (isHalfHour) {
      return `每天 ${pad2(hourRange.start)} 点到 ${pad2(hourRange.end)} 点，每半小时${tzSuffix}`
    }
    return `每天 ${pad2(hourRange.start)} 点到 ${pad2(hourRange.end)} 点，每 ${minute.slice(2)} 分钟${tzSuffix}`
  }

  if (minuteList && hourRange && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (isHalfHour) {
      return `每天 ${pad2(hourRange.start)} 点到 ${pad2(hourRange.end)} 点，每半小时${tzSuffix}`
    }
    return `每天 ${pad2(hourRange.start)} 点到 ${pad2(hourRange.end)} 点，每小时的 ${minuteMarks}${tzSuffix}`
  }

  const weekdayMap: Record<string, string> = {
    '0': '周日',
    '7': '周日',
    '1': '周一',
    '2': '周二',
    '3': '周三',
    '4': '周四',
    '5': '周五',
    '6': '周六',
    SUN: '周日',
    MON: '周一',
    TUE: '周二',
    WED: '周三',
    THU: '周四',
    FRI: '周五',
    SAT: '周六',
  }
  const normalizeDow = (value: string) => weekdayMap[value.toUpperCase()] || null
  const parseDowPart = (value: string): string | null => {
    if (value.includes('-')) {
      const [start, end] = value.split('-')
      const startText = start ? normalizeDow(start) : null
      const endText = end ? normalizeDow(end) : null
      return startText && endText ? `${startText}至${endText}` : null
    }
    return normalizeDow(value)
  }
  const parseDow = (value: string): string | null => {
    if (value === '*') return null
    const partsText = value.split(',').map((item) => parseDowPart(item.trim())).filter(Boolean) as string[]
    if (!partsText.length) return null
    return partsText.join('、')
  }

  if (isNumber(minute) && isNumber(hour)) {
    const timeText = `${pad2(asNum(hour))}:${pad2(asNum(minute))}`
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `每天 ${timeText}${tzSuffix}`
    }
    const weekText = parseDow(dayOfWeek)
    if (dayOfMonth === '*' && month === '*' && weekText) {
      return `每周${weekText} ${timeText}${tzSuffix}`
    }
    if (isNumber(dayOfMonth) && month === '*' && dayOfWeek === '*') {
      return `每月 ${asNum(dayOfMonth)} 日 ${timeText}${tzSuffix}`
    }
    if (isNumber(dayOfMonth) && isNumber(month) && dayOfWeek === '*') {
      return `每年 ${asNum(month)} 月 ${asNum(dayOfMonth)} 日 ${timeText}${tzSuffix}`
    }
  }

  return `${compactExpr}${tzSuffix}`
}

function formatCronAsEn(expr: string, tz?: string): string {
  const compactExpr = expr.trim().replace(/\s+/g, ' ')
  const parts = compactExpr.split(' ')
  const tzSuffix = tz ? ` (${tz})` : ''
  if (parts.length !== 5) return `${compactExpr}${tzSuffix}`

  const minute = parts[0] ?? ''
  const hour = parts[1] ?? ''
  const dayOfMonth = parts[2] ?? ''
  const month = parts[3] ?? ''
  const dayOfWeek = parts[4] ?? ''
  const isNumber = (value: string) => /^\d+$/.test(value)
  const asNum = (value: string) => (isNumber(value) ? Number(value) : NaN)
  const pad2 = (value: number) => String(value).padStart(2, '0')
  const minuteList = parseNumberList(minute, 0, 59)
  const hourRange = parseNumberRange(hour, 0, 23)
  const minuteMarks = minuteList?.map((num) => `${pad2(num)}`).join(', ') || ''
  const isHalfHour = isHalfHourMinuteRule(minute, minuteList)

  if (isHalfHour && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every half hour${tzSuffix}`
  }

  if (/^\*\/\d+$/.test(minute) && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return t('pages.cron.schedule.every', {
      value: Number(minute.slice(2)),
      unit: t('pages.cron.units.minutes'),
    }) + tzSuffix
  }

  if (minuteList && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every hour at ${minuteMarks} min${tzSuffix}`
  }

  if (minute === '0' && /^\*\/\d+$/.test(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return t('pages.cron.schedule.every', {
      value: Number(hour.slice(2)),
      unit: t('pages.cron.units.hours'),
    }) + tzSuffix
  }

  if (isNumber(minute) && /^\*\/\d+$/.test(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return t('pages.cron.schedule.everyHoursAtMinute', {
      value: Number(hour.slice(2)),
      minute: pad2(asNum(minute)),
    }) + tzSuffix
  }

  if (/^\*\/\d+$/.test(minute) && hourRange && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (isHalfHour) {
      return `Every half hour between ${pad2(hourRange.start)}:00-${pad2(hourRange.end)}:59 daily${tzSuffix}`
    }
    return `Every ${Number(minute.slice(2))} minutes between ${pad2(hourRange.start)}:00-${pad2(hourRange.end)}:59 daily${tzSuffix}`
  }

  if (minuteList && hourRange && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (isHalfHour) {
      return `Every half hour between ${pad2(hourRange.start)}:00-${pad2(hourRange.end)}:59 daily${tzSuffix}`
    }
    return `Every hour at ${minuteMarks} min between ${pad2(hourRange.start)}:00-${pad2(hourRange.end)}:59 daily${tzSuffix}`
  }

  const weekdayMap: Record<string, string> = {
    '0': 'Sun',
    '7': 'Sun',
    '1': 'Mon',
    '2': 'Tue',
    '3': 'Wed',
    '4': 'Thu',
    '5': 'Fri',
    '6': 'Sat',
    SUN: 'Sun',
    MON: 'Mon',
    TUE: 'Tue',
    WED: 'Wed',
    THU: 'Thu',
    FRI: 'Fri',
    SAT: 'Sat',
  }
  const normalizeDow = (value: string) => weekdayMap[value.toUpperCase()] || null
  const parseDowPart = (value: string): string | null => {
    if (value.includes('-')) {
      const [start, end] = value.split('-')
      const startText = start ? normalizeDow(start) : null
      const endText = end ? normalizeDow(end) : null
      return startText && endText ? `${startText}-${endText}` : null
    }
    return normalizeDow(value)
  }
  const parseDow = (value: string): string | null => {
    if (value === '*') return null
    const partsText = value.split(',').map((item) => parseDowPart(item.trim())).filter(Boolean) as string[]
    if (!partsText.length) return null
    return partsText.join(', ')
  }

  if (isNumber(minute) && isNumber(hour)) {
    const timeText = `${pad2(asNum(hour))}:${pad2(asNum(minute))}`
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return t('pages.cron.schedule.dailyAt', { time: timeText }) + tzSuffix
    }
    const weekText = parseDow(dayOfWeek)
    if (dayOfMonth === '*' && month === '*' && weekText) {
      return t('pages.cron.schedule.weeklyAt', { weekdays: weekText, time: timeText }) + tzSuffix
    }
    if (isNumber(dayOfMonth) && month === '*' && dayOfWeek === '*') {
      return t('pages.cron.schedule.monthlyAt', { day: asNum(dayOfMonth), time: timeText }) + tzSuffix
    }
    if (isNumber(dayOfMonth) && isNumber(month) && dayOfWeek === '*') {
      return t('pages.cron.schedule.yearlyAt', { month: asNum(month), day: asNum(dayOfMonth), time: timeText }) + tzSuffix
    }
  }

  return `${compactExpr}${tzSuffix}`
}

function resolveScheduleText(job: CronJob): string {
  if (job.scheduleObj?.kind === 'cron') {
    return locale.value === 'zh-CN'
      ? formatCronAsCn(job.scheduleObj.expr, job.scheduleObj.tz)
      : formatCronAsEn(job.scheduleObj.expr, job.scheduleObj.tz)
  }
  if (job.scheduleObj?.kind === 'every') {
    const every = resolveEveryForm(job.scheduleObj.everyMs)
    const unitText =
      every.unit === 'minutes'
        ? t('pages.cron.units.minutes')
        : every.unit === 'hours'
          ? t('pages.cron.units.hours')
          : t('pages.cron.units.days')
    return t('pages.cron.schedule.every', { value: every.value, unit: unitText })
  }
  if (job.scheduleObj?.kind === 'at') {
    return t('pages.cron.schedule.at', { time: formatDate(job.scheduleObj.at) })
  }
  if (job.schedule) {
    const schedule = parseCronSource(job.schedule)
    const tz = schedule.tz || job.timezone
    return locale.value === 'zh-CN'
      ? formatCronAsCn(schedule.expr, tz)
      : formatCronAsEn(schedule.expr, tz)
  }
  return '-'
}

function nextRunText(job: CronJob): string {
  if (job.state?.nextRunAtMs) {
    return formatRelativeTime(job.state.nextRunAtMs)
  }
  if (job.nextRun) {
    return formatRelativeTime(job.nextRun)
  }
  return '-'
}

function lastRunText(job: CronJob): string {
  if (job.state?.lastRunAtMs) {
    return formatRelativeTime(job.state.lastRunAtMs)
  }
  if (job.lastRun) {
    return formatRelativeTime(job.lastRun)
  }
  return '-'
}

async function handleRefresh() {
  await Promise.all([
    cronStore.fetchOverview(),
    modelStore.fetchModels(),
    configStore.fetchConfig(),
    sessionStore.fetchSessions(),
  ])
  if (cronStore.selectedJobId) {
    await cronStore.fetchRuns(cronStore.selectedJobId)
  }
}

async function handleSelectJob(row: CronJob) {
  await cronStore.fetchRuns(row.id)
}

async function handleToggle(job: CronJob, value: boolean) {
  try {
    await cronStore.updateJob(job.id, { enabled: value })
    message.success(value ? t('pages.cron.messages.jobEnabled') : t('pages.cron.messages.jobDisabled'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('pages.cron.messages.updateFailed'))
  }
}

async function handleRun(job: CronJob) {
  try {
    await cronStore.runJob(job.id, 'force')
    message.success(t('pages.cron.messages.jobTriggered'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('pages.cron.messages.triggerFailed'))
  }
}

async function handleDelete(job: CronJob) {
  try {
    await cronStore.deleteJob(job.id)
    message.success(t('pages.cron.messages.jobDeleted'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('pages.cron.messages.deleteFailed'))
  }
}

async function handleSubmit() {
  try {
    const payload = buildSubmitPayload()
    if (isEditing.value && editingJobId.value) {
      await cronStore.updateJob(editingJobId.value, payload)
      message.success(t('pages.cron.messages.jobUpdated'))
      if (editingJobId.value) {
        await cronStore.fetchRuns(editingJobId.value)
      }
    } else {
      await cronStore.createJob(payload)
      message.success(t('pages.cron.messages.jobCreated'))
    }
    showModal.value = false
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('common.saveFailed'))
  }
}

function openRunSession(run: CronRunLogEntry) {
  if (!run.sessionKey) return
  router.push({
    name: 'Chat',
    query: { session: run.sessionKey },
  })
}

function openRunDetailModal(run: CronRunLogEntry) {
  selectedRun.value = run
  showRunDetailModal.value = true
}

function openDetailModal(job: CronJob) {
  showDetailModal.value = true
  void handleSelectJob(job)
}

function openEditFromDetail() {
  const job = selectedJob.value
  if (!job) return
  showDetailModal.value = false
  openEditModal(job)
}

function jobRowClassName(row: CronJob): string {
  return row.id === cronStore.selectedJobId ? 'cron-row-selected' : ''
}

function jobRowProps(row: CronJob) {
  return {
    style: 'cursor: pointer;',
    onClick: () => {
      void handleSelectJob(row)
    },
  }
}

function runRowProps(row: CronRunLogEntry) {
  return {
    style: 'cursor: pointer;',
    onClick: () => {
      openRunDetailModal(row)
    },
  }
}
</script>

<template>
  <div class="cron-page">
    <NCard class="cron-hero" :bordered="false">
      <template #header>
        <div class="cron-hero-title">{{ t('pages.cron.title') }}</div>
      </template>
      <template #header-extra>
        <NSpace :size="8">
          <NButton size="small" :loading="cronStore.loading || cronStore.statusLoading" @click="handleRefresh">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('common.refresh') }}
          </NButton>
          <NButton size="small" type="primary" @click="openCreateModal">
            <template #icon><NIcon :component="AddOutline" /></template>
            {{ t('pages.cron.actions.createJob') }}
          </NButton>
        </NSpace>
      </template>

      <NSpace vertical :size="10">
        <NAlert type="info" :show-icon="true" :bordered="false">
          {{ t('pages.cron.tips') }}
        </NAlert>
        <NAlert v-if="!stats.schedulerEnabled" type="warning" :show-icon="true" :bordered="false">
          {{ t('pages.cron.schedulerDisabledHint') }}
        </NAlert>
        <NAlert v-if="cronStore.lastError" type="error" :show-icon="true" :bordered="false">
          {{ t('pages.cron.requestFailed', { error: cronStore.lastError }) }}
        </NAlert>
      </NSpace>

      <div class="cron-template-row">
        <NText depth="3">{{ t('pages.cron.quickTemplates') }}</NText>
        <NSpace :size="8" wrap>
          <NButton
            v-for="preset in quickTemplatePresets"
            :key="preset.id"
            size="small"
            tertiary
            type="primary"
            @click="applyQuickTemplate(preset)"
          >
            {{ preset.label }}
          </NButton>
        </NSpace>
      </div>

      <NGrid cols="1 s:2 m:5" responsive="screen" :x-gap="10" :y-gap="10" class="cron-stats-grid">
        <NGridItem>
          <NCard embedded :bordered="false" class="cron-stat-card">
            <NSpace align="center" justify="space-between">
              <NText depth="3">{{ t('pages.cron.stats.scheduler') }}</NText>
              <NIcon :component="CalendarOutline" />
            </NSpace>
            <div class="cron-stat-value">
              {{ stats.schedulerEnabled ? t('pages.cron.stats.schedulerEnabled') : t('pages.cron.stats.schedulerDisabled') }}
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="cron-stat-card">
            <NSpace align="center" justify="space-between">
              <NText depth="3">{{ t('pages.cron.stats.totalJobs') }}</NText>
              <NIcon :component="TimeOutline" />
            </NSpace>
            <div class="cron-stat-value">{{ stats.total }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="cron-stat-card">
            <NSpace align="center" justify="space-between">
              <NText depth="3">{{ t('pages.cron.stats.enabledJobs') }}</NText>
              <NIcon :component="CheckmarkCircleOutline" />
            </NSpace>
            <div class="cron-stat-value">{{ stats.enabled }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="cron-stat-card">
            <NSpace align="center" justify="space-between">
              <NText depth="3">{{ t('pages.cron.stats.disabledJobs') }}</NText>
              <NIcon :component="PauseCircleOutline" />
            </NSpace>
            <div class="cron-stat-value">{{ stats.disabled }}</div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard embedded :bordered="false" class="cron-stat-card">
            <NText depth="3">{{ t('pages.cron.stats.nextWake') }}</NText>
            <div class="cron-stat-subvalue">{{ stats.nextWakeText }}</div>
          </NCard>
        </NGridItem>
      </NGrid>
    </NCard>

    <NCard class="cron-card" :bordered="false">
      <template #header>
        <NSpace justify="space-between" align="center">
          <NText strong>{{ t('pages.cron.jobs.title') }}</NText>
          <NText depth="3" style="font-size: 12px;">
            {{ t('pages.cron.jobs.count', { count: filteredJobs.length }) }}
          </NText>
        </NSpace>
      </template>

      <div class="cron-filter-row">
        <NInput v-model:value="searchQuery" clearable :placeholder="t('pages.cron.jobs.searchPlaceholder')">
          <template #prefix><NIcon :component="SearchOutline" /></template>
        </NInput>
        <NRadioGroup v-model:value="statusFilter" size="small">
          <NRadioButton value="all">{{ t('common.all') }}</NRadioButton>
          <NRadioButton value="enabled">{{ t('common.enabled') }}</NRadioButton>
          <NRadioButton value="disabled">{{ t('common.disabled') }}</NRadioButton>
        </NRadioGroup>
        <NButton size="small" @click="clearFilters">{{ t('common.clear') }}</NButton>
      </div>

      <NDataTable
        class="cron-job-table"
        :columns="jobColumns"
        :data="filteredJobs"
        :loading="cronStore.loading"
        :bordered="false"
        :pagination="{ pageSize: 8 }"
        :row-key="(row: CronJob) => row.id"
        :row-class-name="jobRowClassName"
        :row-props="jobRowProps"
        style="margin-top: 12px;"
      />

      <NAlert v-if="!cronStore.loading && !hasJobs" type="default" :bordered="false" class="cron-empty-alert">
        {{ t('pages.cron.jobs.emptyHint') }}
      </NAlert>
    </NCard>

    <NCard class="cron-card" :bordered="false">
      <template #header>
        <NSpace justify="space-between" align="center">
          <NText strong>{{ t('pages.cron.runs.title') }}</NText>
          <NText depth="3" style="font-size: 12px;">
            {{ selectedJob
              ? t('pages.cron.runs.subtitle', { name: selectedJob.name, count: orderedRuns.length })
              : t('pages.cron.runs.noSelection') }}
          </NText>
        </NSpace>
      </template>

      <NDataTable
        :columns="runColumns"
        :data="orderedRuns"
        :loading="cronStore.runsLoading"
        :bordered="false"
        :pagination="{ pageSize: 6 }"
        :row-key="(row: CronRunLogEntry) => `${row.jobId}-${row.ts}-${row.sessionKey || ''}`"
        :row-props="runRowProps"
        :scroll-x="760"
      />
    </NCard>

    <NModal
      v-model:show="showRunDetailModal"
      preset="card"
      :title="t('pages.cron.modal.runDetailTitle')"
      style="width: 760px; max-width: calc(100vw - 28px);"
    >
      <template v-if="selectedRun">
        <div class="cron-detail-modal-shell">
          <section class="cron-detail-hero-card">
            <div class="cron-detail-hero-head">
              <div style="min-width: 0;">
                <NText strong class="cron-detail-hero-title">{{ t('pages.cron.runs.detail.summary') }}</NText>
                <NText depth="3" class="cron-detail-desc">{{ selectedRun.summary || selectedRun.error || '-' }}</NText>
              </div>
              <NTag size="small" :bordered="false" round :type="selectedRunStatusType">
                {{ selectedRun.status || 'unknown' }}
              </NTag>
            </div>

            <div class="cron-detail-kpi-grid">
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.runs.detail.jobId') }}</NText>
                <div class="cron-detail-value">{{ selectedRun.jobId }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.runs.detail.runAt') }}</NText>
                <div class="cron-detail-value">{{ formatDate(selectedRun.ts) }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.runs.detail.duration') }}</NText>
                <div class="cron-detail-value">{{ formatDurationSeconds(selectedRun.durationMs) }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.runs.detail.nextRun') }}</NText>
                <div class="cron-detail-value">{{ selectedRun.nextRunAtMs ? formatDate(selectedRun.nextRunAtMs) : '-' }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.runs.detail.session') }}</NText>
                <div class="cron-detail-value">{{ selectedRun.sessionKey || '-' }}</div>
              </div>
            </div>
          </section>

          <section v-if="selectedRun.error" class="cron-detail-panel-card">
            <NText depth="3">{{ t('pages.cron.runs.detail.error') }}</NText>
            <div class="cron-detail-value cron-detail-block">{{ selectedRun.error }}</div>
          </section>

          <section class="cron-detail-panel-card">
            <NText depth="3">{{ t('pages.cron.runs.detail.raw') }}</NText>
            <NCode :code="selectedRunRaw" language="json" :word-wrap="true" />
          </section>
        </div>
      </template>

      <div v-else class="cron-empty-state">
        {{ t('pages.cron.runs.detail.empty') }}
      </div>

      <template #footer>
        <NSpace justify="space-between" align="center" wrap>
          <NButton
            size="small"
            type="primary"
            :disabled="!selectedRun?.sessionKey"
            @click="selectedRun && openRunSession(selectedRun)"
          >
            {{ t('pages.cron.actions.openSession') }}
          </NButton>
          <NButton @click="showRunDetailModal = false">{{ t('common.cancel') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <NModal
      v-model:show="showDetailModal"
      preset="card"
      :title="t('pages.cron.modal.detailTitle')"
      style="width: 980px; max-width: calc(100vw - 28px);"
    >
      <template v-if="selectedJob">
        <div class="cron-detail-modal-shell">
          <section class="cron-detail-hero-card">
            <div class="cron-detail-hero-head">
              <div style="min-width: 0;">
                <NText strong class="cron-detail-hero-title">{{ selectedJob.name }}</NText>
                <NText depth="3" class="cron-detail-desc">{{ selectedJob.description || t('common.noDescription') }}</NText>
              </div>
              <NSpace :size="6" wrap>
                <NTag :type="selectedJob.enabled ? 'success' : 'default'" size="small" :bordered="false" round>
                  {{ selectedJob.enabled ? t('pages.cron.jobStatus.enabled') : t('pages.cron.jobStatus.disabled') }}
                </NTag>
                <NTag v-if="selectedJob.state?.lastStatus" size="small" :bordered="false" round>
                  {{ selectedJob.state?.lastStatus }}
                </NTag>
              </NSpace>
            </div>

            <div class="cron-detail-kpi-grid">
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.detail.schedule') }}</NText>
                <div class="cron-detail-value">{{ resolveScheduleText(selectedJob) }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.detail.execMode') }}</NText>
                <div class="cron-detail-value">{{ selectedJob.sessionTarget || '-' }} / {{ selectedJob.wakeMode || '-' }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.detail.payloadKind') }}</NText>
                <div class="cron-detail-value">{{ selectedJob.payload?.kind || '-' }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.detail.model') }}</NText>
                <div class="cron-detail-value">{{ selectedJobModelText }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.detail.agent') }}</NText>
                <div class="cron-detail-value">{{ selectedJob.agentId || t('pages.cron.defaultAgent') }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.detail.nextRun') }}</NText>
                <div class="cron-detail-value">{{ nextRunText(selectedJob) }}</div>
              </div>
              <div class="cron-detail-kpi-card">
                <NText depth="3">{{ t('pages.cron.detail.lastRun') }}</NText>
                <div class="cron-detail-value">{{ lastRunText(selectedJob) }}</div>
              </div>
            </div>
          </section>

          <section class="cron-detail-panel-card">
            <NText depth="3">{{ t('pages.cron.detail.payload') }}</NText>
            <div
              v-if="selectedJobPayloadHtml"
              class="cron-detail-value cron-detail-block cron-markdown"
              v-html="selectedJobPayloadHtml"
            ></div>
            <div v-else class="cron-detail-value cron-detail-block">-</div>
          </section>

          <section v-if="selectedJob.delivery" class="cron-detail-panel-card">
            <NText depth="3">{{ t('pages.cron.detail.delivery') }}</NText>
            <div class="cron-detail-value cron-detail-block">
              {{ selectedJob.delivery.mode }}
              <span v-if="selectedJob.delivery.channel"> / {{ selectedJob.delivery.channel }}</span>
              <span v-if="selectedJob.delivery.to"> / {{ selectedJob.delivery.to }}</span>
            </div>
          </section>

          <NAlert
            v-if="selectedJob.state?.lastError"
            type="error"
            :show-icon="true"
            :bordered="false"
            class="cron-error-alert"
          >
            {{ t('pages.cron.detail.lastError', { error: selectedJob.state?.lastError }) }}
          </NAlert>
        </div>
      </template>

      <div v-else class="cron-empty-state">
        {{ t('pages.cron.detail.emptyHint') }}
      </div>

      <template #footer>
        <NSpace justify="space-between" align="center" wrap>
          <NSpace :size="8" wrap>
            <NButton size="small" type="primary" :disabled="!selectedJob" @click="selectedJob && handleRun(selectedJob)">
              <template #icon><NIcon :component="PlayOutline" /></template>
              {{ t('pages.cron.actions.runNow') }}
            </NButton>
            <NButton size="small" :disabled="!selectedJob" @click="openEditFromDetail">
              <template #icon><NIcon :component="CreateOutline" /></template>
              {{ t('pages.cron.actions.editJob') }}
            </NButton>
            <NButton size="small" :disabled="!selectedJob" @click="selectedJob && cronStore.fetchRuns(selectedJob.id)">
              <template #icon><NIcon :component="RefreshOutline" /></template>
              {{ t('pages.cron.actions.refreshRuns') }}
            </NButton>
          </NSpace>
          <NButton @click="showDetailModal = false">{{ t('common.cancel') }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <NModal
      v-model:show="showModal"
      preset="card"
      :title="isEditing ? t('pages.cron.modal.editTitle') : t('pages.cron.modal.createTitle')"
      style="width: 860px; max-width: calc(100vw - 32px);"
    >
      <NForm label-placement="left" label-width="110">
        <NDivider title-placement="left">{{ t('pages.cron.modal.sections.basic') }}</NDivider>
        <NGrid cols="1 s:2" responsive="screen" :x-gap="10">
          <NGridItem>
            <NFormItem :label="t('pages.cron.form.name')" required>
              <NInput v-model:value="form.name" :placeholder="t('pages.cron.form.namePlaceholder')" />
            </NFormItem>
          </NGridItem>
          <NGridItem>
            <NFormItem :label="t('pages.cron.form.agentId')">
              <NInput v-model:value="form.agentId" :placeholder="t('pages.cron.form.agentIdPlaceholder')" />
            </NFormItem>
          </NGridItem>
        </NGrid>
        <NFormItem :label="t('pages.cron.form.description')">
          <NInput
            v-model:value="form.description"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            :placeholder="t('pages.cron.form.descriptionPlaceholder')"
          />
        </NFormItem>
        <NGrid cols="1 s:2" responsive="screen" :x-gap="10">
          <NGridItem>
            <NFormItem :label="t('pages.cron.form.enabled')">
              <NSwitch v-model:value="form.enabled" />
            </NFormItem>
          </NGridItem>
          <NGridItem>
            <NFormItem :label="t('pages.cron.form.deleteAfterRun')">
              <NSwitch v-model:value="form.deleteAfterRun" />
            </NFormItem>
          </NGridItem>
        </NGrid>

        <NDivider title-placement="left">{{ t('pages.cron.modal.sections.schedule') }}</NDivider>
        <NFormItem :label="t('pages.cron.form.scheduleKind')">
          <NSelect v-model:value="form.scheduleKind" :options="scheduleKindOptions" />
        </NFormItem>
        <template v-if="form.scheduleKind === 'cron'">
          <NGrid cols="1 s:2" responsive="screen" :x-gap="10">
            <NGridItem>
              <NFormItem :label="t('pages.cron.form.cronExpr')" required>
                <NInput v-model:value="form.cronExpr" :placeholder="t('pages.cron.form.cronExprPlaceholder')" />
              </NFormItem>
            </NGridItem>
            <NGridItem>
              <NFormItem :label="t('pages.cron.form.timezone')">
                <NInput v-model:value="form.cronTz" :placeholder="t('pages.cron.form.timezonePlaceholder')" />
              </NFormItem>
            </NGridItem>
          </NGrid>
        </template>
        <template v-else-if="form.scheduleKind === 'every'">
          <NGrid cols="1 s:2" responsive="screen" :x-gap="10">
            <NGridItem>
              <NFormItem :label="t('pages.cron.form.everyValue')" required>
                <NInputNumber
                  v-model:value="form.everyValue"
                  :min="1"
                  :precision="0"
                  :show-button="false"
                  :placeholder="t('pages.cron.form.everyValuePlaceholder')"
                  style="width: 100%;"
                />
              </NFormItem>
            </NGridItem>
            <NGridItem>
              <NFormItem :label="t('pages.cron.form.everyUnit')" required>
                <NSelect v-model:value="form.everyUnit" :options="everyUnitOptions" />
              </NFormItem>
            </NGridItem>
          </NGrid>
        </template>
        <template v-else>
          <NFormItem :label="t('pages.cron.form.atTime')" required>
            <input v-model="form.atTime" class="cron-native-input" type="datetime-local" />
          </NFormItem>
        </template>

        <NDivider title-placement="left">{{ t('pages.cron.modal.sections.payload') }}</NDivider>
        <NGrid cols="1 s:3" responsive="screen" :x-gap="10">
          <NGridItem>
            <NFormItem :label="t('pages.cron.form.sessionTarget')">
              <NSelect
                v-model:value="form.sessionTarget"
                :options="[
                  { label: t('pages.cron.form.sessionTargets.isolated'), value: 'isolated' },
                  { label: t('pages.cron.form.sessionTargets.main'), value: 'main' },
                ]"
              />
            </NFormItem>
          </NGridItem>
          <NGridItem>
            <NFormItem :label="t('pages.cron.form.wakeMode')">
              <NSelect
                v-model:value="form.wakeMode"
                :options="[
                  { label: t('pages.cron.form.wakeModes.nextHeartbeat'), value: 'next-heartbeat' },
                  { label: t('pages.cron.form.wakeModes.now'), value: 'now' },
                ]"
              />
            </NFormItem>
          </NGridItem>
          <NGridItem>
            <NFormItem :label="t('pages.cron.form.payloadKind')">
              <NSelect
                v-model:value="form.payloadKind"
                :disabled="form.sessionTarget === 'main'"
                :options="[
                  { label: t('pages.cron.payloadKinds.agentTurn'), value: 'agentTurn' },
                  { label: t('pages.cron.payloadKinds.systemEvent'), value: 'systemEvent' },
                ]"
              />
            </NFormItem>
          </NGridItem>
        </NGrid>
        <NFormItem :label="t('pages.cron.form.payloadText')" required>
          <NInput
            v-model:value="form.payloadText"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :placeholder="form.payloadKind === 'agentTurn'
              ? t('pages.cron.form.payloadTextPlaceholders.agentTurn')
              : t('pages.cron.form.payloadTextPlaceholders.systemEvent')"
          />
        </NFormItem>

        <template v-if="form.payloadKind === 'agentTurn'">
          <NAlert
            v-if="configStore.lastError"
            type="warning"
            :show-icon="true"
            :bordered="false"
            style="margin-bottom: 10px;"
          >
            {{ t('pages.cron.modelConfigLoadFailed', { error: configStore.lastError }) }}
          </NAlert>
          <NAlert
            v-if="modelStore.lastError"
            type="warning"
            :show-icon="true"
            :bordered="false"
            style="margin-bottom: 10px;"
          >
            {{ t('pages.cron.modelListLoadFailed', { error: modelStore.lastError }) }}
          </NAlert>
          <NGrid cols="1 s:2" responsive="screen" :x-gap="10">
            <NGridItem>
              <NFormItem :label="t('pages.cron.form.modelOverride')">
                <NSelect
                  v-model:value="form.model"
                  :options="modelSelectOptions"
                  :loading="modelStore.loading"
                  filterable
                  tag
                  clearable
                  :placeholder="t('pages.cron.form.modelOverridePlaceholder')"
                />
              </NFormItem>
            </NGridItem>
            <NGridItem>
              <NFormItem :label="t('pages.cron.form.timeoutSeconds')">
                <NInputNumber
                  v-model:value="form.timeoutSeconds"
                  :min="1"
                  :precision="0"
                  :show-button="false"
                  :placeholder="t('pages.cron.form.timeoutSecondsPlaceholder')"
                  style="width: 100%;"
                />
              </NFormItem>
            </NGridItem>
          </NGrid>
        </template>

        <template v-if="form.sessionTarget === 'isolated' && form.payloadKind === 'agentTurn'">
          <NDivider title-placement="left">{{ t('pages.cron.modal.sections.delivery') }}</NDivider>
          <NGrid cols="1 s:3" responsive="screen" :x-gap="10">
            <NGridItem>
              <NFormItem :label="t('pages.cron.form.deliveryMode')">
                <NSelect
                  v-model:value="form.deliveryMode"
                  :options="[
                    { label: t('pages.cron.form.deliveryModes.announce'), value: 'announce' },
                    { label: t('pages.cron.form.deliveryModes.none'), value: 'none' },
                  ]"
                />
              </NFormItem>
            </NGridItem>
            <NGridItem>
              <NFormItem :label="t('pages.cron.form.deliveryChannel')">
                <NSelect
                  v-model:value="form.deliveryChannel"
                  :disabled="form.deliveryMode === 'none'"
                  :options="deliveryChannelOptions"
                />
              </NFormItem>
            </NGridItem>
            <NGridItem>
              <NFormItem :label="t('pages.cron.form.deliveryTo')">
                <NSelect
                  v-model:value="form.deliveryTo"
                  :disabled="form.deliveryMode === 'none'"
                  :options="deliveryTargetOptions"
                  filterable
                  tag
                  clearable
                  :placeholder="form.deliveryChannel === 'last'
                    ? t('pages.cron.form.deliveryToPlaceholders.last')
                    : t('pages.cron.form.deliveryToPlaceholders.specific')"
                />
              </NFormItem>
            </NGridItem>
          </NGrid>
          <NFormItem :label="t('pages.cron.form.bestEffort')">
            <NSwitch v-model:value="form.deliveryBestEffort" :disabled="form.deliveryMode === 'none'" />
          </NFormItem>
        </template>

        <NDivider title-placement="left">{{ t('pages.cron.modal.sections.preview') }}</NDivider>
        <NCode :code="previewPayload" language="json" :word-wrap="true" />
      </NForm>

      <template #footer>
        <NSpace justify="space-between" align="center">
          <NText depth="3" style="font-size: 12px;">
            {{ t('pages.cron.modal.footerHint') }}
          </NText>
          <NSpace>
            <NButton @click="showModal = false">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" :loading="cronStore.saving" @click="handleSubmit">
              {{ isEditing ? t('pages.cron.actions.saveChanges') : t('pages.cron.actions.createJob') }}
            </NButton>
          </NSpace>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
:deep(.cron-job-table .n-data-table-wrapper) {
  overflow-x: auto;
}

:deep(.cron-job-table .n-data-table-th) {
  padding-top: 8px;
  padding-bottom: 8px;
  font-size: 12px;
}

:deep(.cron-job-table .n-data-table-td) {
  padding-top: 8px;
  padding-bottom: 8px;
  font-size: 12px;
}

:deep(.cron-job-table .cron-row-selected > td) {
  background: rgba(24, 160, 88, 0.12);
  transition: background-color 0.15s ease;
}

:deep(.cron-job-table .cron-row-selected > td:first-child) {
  box-shadow: inset 3px 0 0 var(--success-color);
}

:deep(.cron-job-table .cron-row-selected:hover > td) {
  background: rgba(24, 160, 88, 0.18);
}

.cron-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cron-hero {
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 82% 14%, rgba(24, 160, 88, 0.2), transparent 34%),
    linear-gradient(125deg, var(--bg-card), rgba(32, 128, 240, 0.08));
  border: 1px solid rgba(24, 160, 88, 0.18);
}

.cron-hero-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
}

.cron-template-row {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cron-stats-grid {
  margin-top: 12px;
}

.cron-stat-card {
  border-radius: 10px;
}

.cron-stat-value {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
}

.cron-stat-subvalue {
  margin-top: 10px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.cron-card {
  border-radius: var(--radius-lg);
}

.cron-filter-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) auto auto;
  gap: 8px;
  align-items: center;
}

.cron-empty-alert {
  margin-top: 10px;
}

.cron-job-actions {
  align-items: center;
  flex-wrap: nowrap;
}

.cron-action-btn {
  min-width: 72px;
  height: 34px;
  padding: 0 12px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.1px;
  white-space: nowrap;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.cron-action-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.12);
}

.cron-detail-modal-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cron-detail-hero-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  background:
    radial-gradient(circle at 92% 10%, rgba(24, 160, 88, 0.16), transparent 42%),
    linear-gradient(130deg, var(--bg-card), rgba(32, 128, 240, 0.05));
}

.cron-detail-hero-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.cron-detail-hero-title {
  display: block;
  font-size: 18px;
  line-height: 1.3;
  word-break: break-word;
}

.cron-detail-desc {
  display: block;
  margin-top: 7px;
}

.cron-detail-kpi-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.cron-detail-kpi-card,
.cron-detail-panel-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 9px 10px;
  background: var(--bg-primary);
}

.cron-detail-panel-card {
  padding: 10px 11px;
}

.cron-detail-value {
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.cron-detail-block {
  margin-top: 6px;
}

.cron-markdown {
  white-space: normal;
  line-height: 1.7;
  word-break: break-word;
  overflow-wrap: break-word;
}

.cron-markdown :deep(> :first-child) {
  margin-top: 0;
}

.cron-markdown :deep(> :last-child) {
  margin-bottom: 0;
}

.cron-markdown :deep(p) {
  margin: 4px 0;
}

.cron-markdown :deep(ul),
.cron-markdown :deep(ol) {
  margin: 6px 0;
  padding-left: 1.35em;
}

.cron-markdown :deep(li) {
  margin: 2px 0;
}

.cron-markdown :deep(a) {
  color: var(--link-color);
  text-decoration: underline;
  text-decoration-color: var(--link-underline);
  text-underline-offset: 2px;
}

.cron-markdown :deep(a:hover) {
  color: var(--link-color-hover);
  text-decoration-color: var(--link-color-hover);
}

.cron-markdown :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--md-code-border);
  background: var(--md-code-bg);
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  font-size: 0.88em;
}

.cron-markdown :deep(pre) {
  margin: 8px 0;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--md-code-border);
  background: var(--md-pre-bg);
  overflow-x: auto;
}

.cron-markdown :deep(pre code) {
  padding: 0;
  border: 0;
  background: transparent;
}

.cron-error-alert {
  margin-top: 12px;
}

.cron-empty-state {
  text-align: center;
  padding: 100px 0;
  color: var(--text-secondary);
}

.cron-native-input {
  width: 100%;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-card);
  color: var(--text-primary);
}

@media (max-width: 1200px) {
  .cron-filter-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
</style>
