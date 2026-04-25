<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NGrid,
  NGridItem,
  NIcon,
  NSpace,
  NSpin,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  ChatbubblesOutline,
  ChatboxEllipsesOutline,
  ExtensionPuzzleOutline,
  FlashOutline,
  RefreshOutline,
  SettingsOutline,
  SparklesOutline,
  ListOutline,
  AddOutline,
  WalletOutline,
  TrendingUpOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useHermesConnectionStore } from '@/stores/hermes/connection'
import { useHermesSessionStore } from '@/stores/hermes/session'
import { useHermesModelStore } from '@/stores/hermes/model'
import { useHermesSkillStore } from '@/stores/hermes/skill'
import { useHermesConfigStore } from '@/stores/hermes/config'
import { formatRelativeTime } from '@/utils/format'
import type { HermesSession, HermesUsageAnalytics } from '@/api/hermes/types'

type UsageMode = 'tokens' | 'cost'

const router = useRouter()
const { t } = useI18n()
const message = useMessage()

const connStore = useHermesConnectionStore()
const sessionStore = useHermesSessionStore()
const modelStore = useHermesModelStore()
const skillStore = useHermesSkillStore()
const configStore = useHermesConfigStore()

const loading = ref(true)
const testingConnection = ref(false)

const usageDays = ref(7)
const usageMode = ref<UsageMode>('tokens')
const usageData = ref<HermesUsageAnalytics | null>(null)
const usageLoading = ref(false)
const usageError = ref<string | null>(null)
const trendSvgRef = ref<SVGSVGElement | null>(null)
const trendHoverIndex = ref<number | null>(null)
const trendTooltipStyle = ref<Record<string, string> | null>(null)

// ---- Connection Status ----

const connectionLabel = computed(() => {
  if (connStore.hermesConnecting) return t('pages.hermesDashboard.connection.connecting')
  if (connStore.hermesConnected) return t('pages.hermesDashboard.connection.connected')
  if (connStore.hermesError) return t('pages.hermesDashboard.connection.failed')
  return t('pages.hermesDashboard.connection.disconnected')
})

const connectionType = computed<'success' | 'warning' | 'error' | 'default'>(() => {
  if (connStore.hermesConnected) return 'success'
  if (connStore.hermesConnecting) return 'warning'
  if (connStore.hermesError) return 'error'
  return 'default'
})

const gatewayVersion = computed(() => connStore.hermesStatus?.version || '-')

const uptimeDisplay = computed(() => {
  const updatedAt = connStore.hermesStatus?.gateway_updated_at
  if (!updatedAt) return '-'
  try {
    const startTime = new Date(updatedAt).getTime()
    const now = Date.now()
    const uptimeSeconds = Math.floor((now - startTime) / 1000)
    if (uptimeSeconds < 0) return '-'
    return formatUptime(uptimeSeconds)
  } catch {
    return '-'
  }
})

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return t('pages.hermesDashboard.uptime.days', { days, hours, minutes })
  if (hours > 0) return t('pages.hermesDashboard.uptime.hours', { hours, minutes })
  return t('pages.hermesDashboard.uptime.minutes', { minutes })
}

async function handleTestConnection() {
  testingConnection.value = true
  try {
    const result = await connStore.testConnection(
      connStore.connectionConfig.apiUrl,
      connStore.connectionConfig.apiKey,
    )
    if (result.ok) {
      message.success(t('pages.hermesDashboard.connection.testSuccess'))
    } else {
      message.error(t('pages.hermesDashboard.connection.testFailed', { error: result.error || 'Unknown' }))
    }
  } catch (err) {
    message.error(t('pages.hermesDashboard.connection.testFailed', { error: err instanceof Error ? err.message : String(err) }))
  } finally {
    testingConnection.value = false
  }
}

// ---- Quick Stats ----

const totalSessions = computed(() => sessionStore.sessions.length)

const totalMessages = computed(() =>
  sessionStore.sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0),
)

const activeModels = computed(() =>
  modelStore.models.filter((m) => m.enabled !== false && m.available !== false).length,
)

const enabledSkills = computed(() =>
  skillStore.skills.filter((s) => s.enabled).length,
)

// ---- Usage Analytics ----

const totalTokens = computed(() => {
  if (!usageData.value) return 0
  return usageData.value.totals.total_input + usageData.value.totals.total_output
})

const tokenSegments = computed(() => {
  if (!usageData.value) return []
  if (usageMode.value === 'tokens') {
    return [
      { key: 'input', label: t('pages.hermesDashboard.usage.inputTokens'), value: usageData.value.totals.total_input, color: '#2a7fff' },
      { key: 'output', label: t('pages.hermesDashboard.usage.outputTokens'), value: usageData.value.totals.total_output, color: '#18a058' },
    ]
  }
  return [
    { key: 'inputCost', label: t('pages.hermesDashboard.usage.totalCost'), value: usageData.value.totals.total_estimated_cost, color: '#2a7fff' },
  ]
})

const segmentTotal = computed(() => {
  const sum = tokenSegments.value.reduce((acc, item) => acc + item.value, 0)
  return sum > 0 ? sum : 1
})

const dailyTrendSeries = computed(() => {
  if (!usageData.value?.daily) return []
  return usageData.value.daily.map((item) => ({
    date: item.day,
    tokens: item.input_tokens + item.output_tokens,
    cost: item.estimated_cost,
    inputTokens: item.input_tokens,
    outputTokens: item.output_tokens,
  }))
})

const trendGeometry = computed(() => {
  const width = 760
  const height = 200
  const left = 50
  const right = 16
  const top = 16
  const bottom = 36
  const series = dailyTrendSeries.value
  const usableWidth = width - left - right
  const usableHeight = height - top - bottom
  const valueKey = usageMode.value === 'tokens' ? 'tokens' : 'cost'
  const maxValue = Math.max(...series.map((item) => item[valueKey] as number), 0, 1)

  const points = series.map((item, index) => {
    const x =
      series.length === 1
        ? left + usableWidth / 2
        : left + (index / (series.length - 1)) * usableWidth
    const y = top + usableHeight - ((item[valueKey] as number) / maxValue) * usableHeight
    return {
      ...item,
      x,
      y,
    }
  })

  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const areaPath = points.length
    ? `M ${left} ${top + usableHeight} L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${left + usableWidth} ${top + usableHeight} Z`
    : ''
  const guides = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    y: top + usableHeight - usableHeight * ratio,
    value: maxValue * ratio,
  }))

  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    usableWidth,
    usableHeight,
    maxValue,
    points,
    polyline,
    areaPath,
    guides,
  }
})

const trendAxisLabels = computed(() => {
  if (dailyTrendSeries.value.length === 0) {
    return { start: '-', mid: '-', end: '-' }
  }
  const start = dailyTrendSeries.value[0]
  const mid = dailyTrendSeries.value[Math.floor((dailyTrendSeries.value.length - 1) / 2)]
  const end = dailyTrendSeries.value[dailyTrendSeries.value.length - 1]
  return {
    start: start?.date.slice(5) || '-',
    mid: mid?.date.slice(5) || '-',
    end: end?.date.slice(5) || '-',
  }
})

const hoveredTrendPoint = computed(() => {
  const index = trendHoverIndex.value
  if (index === null) return null
  return trendGeometry.value.points[index] || null
})

const hoveredTrendText = computed(() => {
  const point = hoveredTrendPoint.value
  if (!point) return ''
  return t('pages.hermesDashboard.usage.pointTitle', {
    date: point.date,
    tokens: formatCompactNumber(point.tokens),
    cost: formatUsd(point.cost),
  })
})

// ---- Recent Sessions ----

const recentSessions = computed(() =>
  [...sessionStore.sessions]
    .sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return dateB - dateA
    })
    .slice(0, 5),
)

const sessionColumns = computed<DataTableColumns<HermesSession>>(() => [
  {
    title: t('pages.hermesDashboard.recentSessions.columns.sessionId'),
    key: 'id',
    width: 140,
    ellipsis: { tooltip: true },
    render(row) {
      return h('span', { style: 'font-family: var(--mono); font-size: 12px;' }, row.id)
    },
  },
  {
    title: t('pages.hermesDashboard.recentSessions.columns.title'),
    key: 'title',
    width: 100,
    ellipsis: { tooltip: true },
    render(row) {
      return row.title || '-'
    },
  },
  {
    title: t('pages.hermesDashboard.recentSessions.columns.model'),
    key: 'model',
    width: 120,
    ellipsis: { tooltip: true },
    render(row) {
      return row.model || '-'
    },
  },
  {
    title: t('pages.hermesDashboard.recentSessions.columns.messages'),
    key: 'messageCount',
    width: 80,
    align: 'center',
    render(row) {
      return row.messageCount || 0
    },
  },
  {
    title: t('pages.hermesDashboard.recentSessions.columns.lastUpdated'),
    key: 'updatedAt',
    width: 70,
    render(row) {
      return row.updatedAt ? formatRelativeTime(row.updatedAt) : '-'
    },
  },
  {
    title: t('pages.hermesDashboard.recentSessions.columns.actions'),
    key: 'actions',
    width: 60,
    align: 'center',
    render(row) {
      return h(
        NButton,
        {
          size: 'tiny',
          type: 'primary',
          secondary: true,
          onClick: () => goToChat(row.id),
        },
        { default: () => t('pages.hermesDashboard.recentSessions.chat') },
      )
    },
  },
])

function goToChat(sessionId?: string) {
  if (sessionId) {
    router.push({ name: 'HermesChat', query: { session: sessionId } })
  } else {
    router.push({ name: 'HermesChat' })
  }
}

function viewAllSessions() {
  router.push({ name: 'HermesSessions' })
}

// ---- Active Model ----

const currentModelInfo = computed(() => {
  const providerName = currentProviderName.value
  
  if (modelStore.currentModel) {
    const found = modelStore.models.find((m) => m.id === modelStore.currentModel)
    if (found) {
      return {
        ...found,
        provider: found.provider || providerName,
      }
    }
  }
  
  const configDefaultModel = typeof configStore.config?.model === 'string'
    ? configStore.config.model
    : configStore.config?.model?.default
    
  if (configDefaultModel) {
    const found = modelStore.models.find((m) => m.id === configDefaultModel)
    if (found) {
      return {
        ...found,
        provider: found.provider || providerName,
      }
    }
    return {
      id: configDefaultModel,
      label: configDefaultModel,
      provider: providerName,
    }
  }
  
  const firstModel = modelStore.models.find((m) => m.enabled !== false) || modelStore.models[0]
  if (firstModel) {
    return {
      ...firstModel,
      provider: firstModel.provider || providerName,
    }
  }
  
  return null
})

const currentProviderName = computed(() => {
  const config = configStore.config
  if (!config) {
    return 'Unknown'
  }
  
  let modelConfig: { default?: string; provider?: string } | undefined
  
  if (typeof config.model === 'string') {
    modelConfig = { default: config.model }
  } else if (config.model && typeof config.model === 'object') {
    modelConfig = config.model
  }
  
  const providerKey = modelConfig?.provider
  const defaultModel = modelConfig?.default || (typeof config.model === 'string' ? config.model : undefined)
  
  if (providerKey) {
    if (providerKey.startsWith('custom:')) {
      const providerId = providerKey.slice(7)
      const customProviders = config.custom_providers
      if (customProviders) {
        const providersArray = Array.isArray(customProviders) ? customProviders : [customProviders]
        const found = providersArray.find((p: { name: string }) => 
          p.name === providerId || p.name.toLowerCase() === providerId.toLowerCase()
        )
        if (found) return found.name
      }
      return providerId
    }
    return providerKey
  }
  
  if (defaultModel) {
    const customProviders = config.custom_providers
    if (customProviders) {
      const providersArray = Array.isArray(customProviders) ? customProviders : [customProviders]
      const found = providersArray.find((p: { model?: string; name: string }) => 
        p.model === defaultModel
      )
      if (found) return found.name
    }
  }
  
  if (config.provider) return config.provider
  if (config.modelProvider) return config.modelProvider
  
  return 'Unknown'
})

function goToModels() {
  router.push({ name: 'HermesModels' })
}

// ---- Quick Actions ----

function newChat() {
  router.push({ name: 'HermesChat' })
}

function manageSessions() {
  router.push({ name: 'HermesSessions' })
}

function configureModels() {
  router.push({ name: 'HermesModels' })
}

function systemSettings() {
  router.push({ name: 'HermesSystem' })
}

// ---- Usage Analytics Helpers ----

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value)
}

async function fetchUsageAnalytics() {
  if (!connStore.hermesConnected) {
    usageError.value = t('pages.hermesDashboard.usage.errorNotConnected')
    return
  }
  const client = connStore.getClient()
  if (!client) {
    usageError.value = t('pages.hermesDashboard.usage.errorNoClient')
    return
  }

  usageLoading.value = true
  usageError.value = null
  try {
    usageData.value = await client.getUsageAnalytics(usageDays.value)
  } catch (err) {
    console.error('Failed to fetch usage analytics:', err)
    usageData.value = null
    if (err instanceof Error) {
      if (err.message.includes('502') || err.message.includes('unavailable')) {
        usageError.value = t('pages.hermesDashboard.usage.errorDashboard')
      } else {
        usageError.value = err.message
      }
    } else {
      usageError.value = String(err)
    }
  } finally {
    usageLoading.value = false
  }
}

function setUsageDays(days: number) {
  usageDays.value = days
  fetchUsageAnalytics()
}

function clearTrendHover() {
  trendHoverIndex.value = null
  trendTooltipStyle.value = null
}

function handleTrendMouseMove(event: MouseEvent) {
  const svg = trendSvgRef.value
  const points = trendGeometry.value.points
  if (!svg || points.length === 0) {
    clearTrendHover()
    return
  }

  const firstPoint = points[0]
  if (!firstPoint) {
    clearTrendHover()
    return
  }

  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    clearTrendHover()
    return
  }

  const svgX = ((event.clientX - rect.left) / rect.width) * trendGeometry.value.width
  const plotMinX = trendGeometry.value.left
  const plotMaxX = trendGeometry.value.left + trendGeometry.value.usableWidth
  if (svgX < plotMinX || svgX > plotMaxX) {
    clearTrendHover()
    return
  }

  let nearestIndex = 0
  let nearestDistance = Math.abs(firstPoint.x - svgX)
  for (let i = 1; i < points.length; i += 1) {
    const candidate = points[i]
    if (!candidate) continue

    const distance = Math.abs(candidate.x - svgX)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = i
    }
  }

  const point = points[nearestIndex]
  if (!point) {
    clearTrendHover()
    return
  }
  trendHoverIndex.value = nearestIndex

  const tooltipWidth = 200
  const tooltipHeight = 28
  const margin = 8
  const offsetX = 12
  const offsetY = 10

  const pointPxX = (point.x / trendGeometry.value.width) * rect.width
  const pointPxY = (point.y / trendGeometry.value.height) * rect.height

  let left = pointPxX + offsetX
  let top = pointPxY - offsetY - tooltipHeight

  if (left + tooltipWidth > rect.width - margin) left = pointPxX - offsetX - tooltipWidth
  left = Math.max(margin, Math.min(left, rect.width - tooltipWidth - margin))

  if (top < margin) top = pointPxY + offsetY
  top = Math.max(margin, Math.min(top, rect.height - tooltipHeight - margin))

  trendTooltipStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
  }
}

// ---- Data Loading ----

async function refreshData() {
  loading.value = true
  try {
    if (!connStore.hermesConnected) {
      await connStore.connect()
    }
    await Promise.allSettled([
      sessionStore.fetchSessions(),
      modelStore.fetchModels(),
      skillStore.fetchSkills(),
      configStore.fetchConfig(),
      fetchUsageAnalytics(),
    ])
    modelStore.syncCurrentModelSelectionFromConfig()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshData()
})
</script>

<template>
  <NSpin :show="loading">
    <div class="hermes-dashboard">
      <!-- Connection Status Card -->
      <NCard class="app-card hermes-hero" :bordered="false">
        <div class="hermes-hero-top">
          <div class="hermes-hero-info">
            <div class="hermes-hero-title">{{ t('pages.hermesDashboard.hero.title') }}</div>
            <div class="hermes-hero-subtitle">{{ t('pages.hermesDashboard.hero.subtitle') }}</div>
          </div>
          <NSpace :size="12" align="center" wrap>
            <div class="connection-indicator" :class="connectionType">
              <span class="connection-dot" />
              <NText>{{ connectionLabel }}</NText>
            </div>
          </NSpace>
        </div>

        <div class="hermes-hero-details">
          <div class="hero-detail-item">
            <NText depth="3">{{ t('pages.hermesDashboard.connection.version') }}</NText>
            <NText strong>{{ gatewayVersion }}</NText>
          </div>
          <div class="hero-detail-item">
            <NText depth="3">{{ t('pages.hermesDashboard.connection.uptime') }}</NText>
            <NText strong>{{ uptimeDisplay }}</NText>
          </div>
          <NButton
            class="app-toolbar-btn"
            :loading="testingConnection"
            @click="handleTestConnection"
          >
            <template #icon><NIcon :component="FlashOutline" /></template>
            {{ t('pages.hermesDashboard.connection.testConnection') }}
          </NButton>
        </div>
      </NCard>

      <!-- Quick Stats Grid -->
      <NGrid cols="1 s:2 m:4" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem>
          <NCard class="app-card stat-card stat-card--sessions" :bordered="false">
            <div class="stat-card-inner">
              <div class="stat-card-icon" style="background: rgba(24, 160, 88, 0.15); color: #18a058;">
                <NIcon :size="24" :component="ChatbubblesOutline" />
              </div>
              <div class="stat-card-content">
                <div class="stat-card-value">{{ totalSessions }}</div>
                <div class="stat-card-label">{{ t('pages.hermesDashboard.stats.sessions') }}</div>
              </div>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard class="app-card stat-card stat-card--messages" :bordered="false">
            <div class="stat-card-inner">
              <div class="stat-card-icon" style="background: rgba(42, 127, 255, 0.15); color: #2a7fff;">
                <NIcon :size="24" :component="ChatboxEllipsesOutline" />
              </div>
              <div class="stat-card-content">
                <div class="stat-card-value">{{ totalMessages }}</div>
                <div class="stat-card-label">{{ t('pages.hermesDashboard.stats.messages') }}</div>
              </div>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard class="app-card stat-card stat-card--models" :bordered="false">
            <div class="stat-card-inner">
              <div class="stat-card-icon" style="background: rgba(208, 48, 80, 0.15); color: #d03050;">
                <NIcon :size="24" :component="SparklesOutline" />
              </div>
              <div class="stat-card-content">
                <div class="stat-card-value">{{ activeModels }}</div>
                <div class="stat-card-label">{{ t('pages.hermesDashboard.stats.models') }}</div>
              </div>
            </div>
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard class="app-card stat-card stat-card--skills" :bordered="false">
            <div class="stat-card-inner">
              <div class="stat-card-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6;">
                <NIcon :size="24" :component="ExtensionPuzzleOutline" />
              </div>
              <div class="stat-card-content">
                <div class="stat-card-value">{{ enabledSkills }}</div>
                <div class="stat-card-label">{{ t('pages.hermesDashboard.stats.skills') }}</div>
              </div>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Usage Analytics Section -->
      <NCard class="app-card hermes-card" :title="t('pages.hermesDashboard.usage.title')">
        <template #header-extra>
          <NSpace :size="8" align="center" wrap>
            <NButton
              size="small"
              :type="usageDays === 1 ? 'primary' : 'default'"
              secondary
              @click="setUsageDays(1)"
            >
              {{ t('pages.hermesDashboard.usage.range.today') }}
            </NButton>
            <NButton
              size="small"
              :type="usageDays === 7 ? 'primary' : 'default'"
              secondary
              @click="setUsageDays(7)"
            >
              {{ t('pages.hermesDashboard.usage.range.7d') }}
            </NButton>
            <NButton
              size="small"
              :type="usageDays === 30 ? 'primary' : 'default'"
              secondary
              @click="setUsageDays(30)"
            >
              {{ t('pages.hermesDashboard.usage.range.30d') }}
            </NButton>
            <NButton
              size="small"
              :type="usageMode === 'tokens' ? 'primary' : 'default'"
              secondary
              @click="usageMode = 'tokens'"
            >
              {{ t('pages.hermesDashboard.usage.mode.tokens') }}
            </NButton>
            <NButton
              size="small"
              :type="usageMode === 'cost' ? 'primary' : 'default'"
              secondary
              @click="usageMode = 'cost'"
            >
              {{ t('pages.hermesDashboard.usage.mode.cost') }}
            </NButton>
            <NButton
              size="small"
              :loading="usageLoading"
              @click="fetchUsageAnalytics"
            >
              <template #icon><NIcon :component="RefreshOutline" /></template>
              {{ t('pages.hermesDashboard.usage.refresh') }}
            </NButton>
          </NSpace>
        </template>

        <NAlert v-if="usageError" type="warning" style="margin-bottom: 16px;">
          {{ usageError }}
        </NAlert>

        <NSpin :show="usageLoading">
          <template v-if="usageData">
            <NGrid cols="1 m:2" responsive="screen" :x-gap="12" :y-gap="12">
          <NGridItem>
            <NCard class="app-card usage-stat-card" :bordered="false">
              <div class="usage-stat-inner">
                <div class="usage-stat-icon" style="background: rgba(42, 127, 255, 0.15); color: #2a7fff;">
                  <NIcon :size="24" :component="TrendingUpOutline" />
                </div>
                <div class="usage-stat-content">
                  <div class="usage-stat-value">{{ formatCompactNumber(totalTokens) }}</div>
                  <div class="usage-stat-label">{{ t('pages.hermesDashboard.usage.totalTokens') }}</div>
                </div>
              </div>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard class="app-card usage-stat-card usage-stat-card--cost" :bordered="false">
              <div class="usage-stat-inner">
                <div class="usage-stat-icon" style="background: rgba(24, 160, 88, 0.15); color: #18a058">
                  <NIcon :size="24" :component="WalletOutline" />
                </div>
                <div class="usage-stat-content">
                  <div class="usage-stat-value">{{ formatUsd(usageData?.totals?.total_estimated_cost || 0) }}</div>
                  <div class="usage-stat-label">{{ t('pages.hermesDashboard.usage.totalCost') }}</div>
                </div>
              </div>
            </NCard>
          </NGridItem>
        </NGrid>

        <!-- Token Distribution Bar -->
        <div v-if="usageData && tokenSegments.length > 0" class="token-distribution">
          <NSpace justify="space-between" align="center" style="margin-bottom: 8px;">
            <NText depth="3">{{ usageMode === 'tokens' ? t('pages.hermesDashboard.usage.totalTokens') : t('pages.hermesDashboard.usage.totalCost') }}</NText>
            <NText strong>{{ usageMode === 'tokens' ? formatCompactNumber(totalTokens) : formatUsd(usageData.totals.total_estimated_cost) }}</NText>
          </NSpace>
          <div class="segment-track">
            <div
              v-for="segment in tokenSegments"
              :key="segment.key"
              class="segment-item"
              :style="{
                width: `${Math.max((segment.value / segmentTotal) * 100, segment.value > 0 ? 4 : 0)}%`,
                background: segment.color,
              }"
            />
          </div>
          <div class="segment-list">
            <div v-for="segment in tokenSegments" :key="`${segment.key}-row`" class="segment-row">
              <div class="segment-row-label">
                <span class="segment-dot" :style="{ background: segment.color }" />
                <span>{{ segment.label }}</span>
              </div>
              <NText>{{ usageMode === 'tokens' ? formatCompactNumber(segment.value) : formatUsd(segment.value) }}</NText>
            </div>
          </div>
        </div>

        <!-- Daily Trend Chart -->
        <NCard class="app-card hermes-card" :title="t('pages.hermesDashboard.usage.trend')">
          <div class="trend-chart-panel">
            <template v-if="trendGeometry.points.length">
              <div class="trend-chart-canvas">
                <svg
                  ref="trendSvgRef"
                  class="trend-chart-svg"
                  :viewBox="`0 0 ${trendGeometry.width} ${trendGeometry.height}`"
                  preserveAspectRatio="none"
                  @mousemove="handleTrendMouseMove"
                  @mouseleave="clearTrendHover"
                >
                  <g v-for="guide in trendGeometry.guides" :key="`guide-${guide.ratio}`">
                    <line
                      :x1="trendGeometry.left"
                      :y1="guide.y"
                      :x2="trendGeometry.left + trendGeometry.usableWidth"
                      :y2="guide.y"
                      class="trend-grid-line"
                    />
                    <text
                      x="4"
                      :y="guide.y + 4"
                      class="trend-grid-label"
                    >
                      {{ usageMode === 'tokens' ? formatCompactNumber(guide.value) : formatUsd(guide.value) }}
                    </text>
                  </g>

                  <path
                    v-if="trendGeometry.areaPath"
                    class="trend-area"
                    :d="trendGeometry.areaPath"
                  />
                  <polyline
                    v-if="trendGeometry.polyline"
                    class="trend-line"
                    :points="trendGeometry.polyline"
                  />
                  <line
                    v-if="hoveredTrendPoint"
                    class="trend-hover-line"
                    :x1="hoveredTrendPoint.x"
                    :y1="trendGeometry.top"
                    :x2="hoveredTrendPoint.x"
                    :y2="trendGeometry.top + trendGeometry.usableHeight"
                  />
                  <circle
                    v-for="point in trendGeometry.points"
                    :key="`point-${point.date}`"
                    class="trend-point"
                    :class="{ 'trend-point-active': hoveredTrendPoint?.date === point.date }"
                    :cx="point.x"
                    :cy="point.y"
                    :r="hoveredTrendPoint?.date === point.date ? 5 : 3"
                  />
                </svg>

                <div v-if="hoveredTrendPoint && trendTooltipStyle" class="trend-tooltip" :style="trendTooltipStyle">
                  {{ hoveredTrendText }}
                </div>
              </div>

              <div class="trend-axis-note">
                <span>{{ trendAxisLabels.start }}</span>
                <span>{{ trendAxisLabels.mid }}</span>
                <span>{{ trendAxisLabels.end }}</span>
              </div>
            </template>
            <div v-else class="trend-empty">{{ t('pages.hermesDashboard.usage.trendEmpty') }}</div>
          </div>
        </NCard>
          </template>
          <template v-else-if="!usageLoading && !usageError">
            <div class="usage-empty-state">
              <NText depth="3">{{ t('pages.hermesDashboard.usage.noData') }}</NText>
            </div>
          </template>
        </NSpin>
      </NCard>

      <!-- Recent Sessions + Active Model -->
      <NGrid cols="1 l:3" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem :span="2">
          <NCard class="app-card hermes-card" :title="t('pages.hermesDashboard.recentSessions.title')">
            <template #header-extra>
              <NButton text type="primary" @click="viewAllSessions">
                {{ t('pages.hermesDashboard.recentSessions.viewAll') }}
              </NButton>
            </template>
            <NDataTable
              :columns="sessionColumns"
              :data="recentSessions"
              :bordered="false"
              :single-line="false"
              size="small"
              :row-props="(row: HermesSession) => ({
                style: 'cursor: pointer;',
                onClick: () => goToChat(row.id),
              })"
            />
          </NCard>
        </NGridItem>

        <NGridItem :span="1">
          <NCard class="app-card hermes-card" :title="t('pages.hermesDashboard.activeModel.title')">
            <template v-if="currentModelInfo">
              <div class="active-model-info">
                <div class="active-model-name">{{ currentModelInfo.label || currentModelInfo.id }}</div>
                <div class="active-model-provider">
                  <NTag size="small" :bordered="false" round type="info">
                    {{ currentModelInfo.provider || 'Unknown' }}
                  </NTag>
                </div>
                <div v-if="currentModelInfo.description" class="active-model-desc">
                  <NText depth="3">{{ currentModelInfo.description }}</NText>
                </div>
                <NButton
                  class="app-toolbar-btn"
                  type="primary"
                  secondary
                  block
                  style="margin-top: 12px;"
                  @click="goToModels"
                >
                  <template #icon><NIcon :component="SparklesOutline" /></template>
                  {{ t('pages.hermesDashboard.activeModel.changeModel') }}
                </NButton>
              </div>
            </template>
            <div v-else class="active-model-empty">
              <NText depth="3">{{ t('pages.hermesDashboard.activeModel.noModel') }}</NText>
            </div>
          </NCard>
        </NGridItem>
      </NGrid>

      <!-- Quick Actions -->
      <NCard class="app-card hermes-card" :title="t('pages.hermesDashboard.quickActions.title')">
        <div class="quick-actions-grid">
          <div class="quick-action-item" @click="newChat">
            <div class="quick-action-icon" style="background: rgba(24, 160, 88, 0.12); color: #18a058;">
              <NIcon :size="22" :component="AddOutline" />
            </div>
            <div class="quick-action-label">{{ t('pages.hermesDashboard.quickActions.newChat') }}</div>
          </div>
          <div class="quick-action-item" @click="manageSessions">
            <div class="quick-action-icon" style="background: rgba(42, 127, 255, 0.12); color: #2a7fff;">
              <NIcon :size="22" :component="ListOutline" />
            </div>
            <div class="quick-action-label">{{ t('pages.hermesDashboard.quickActions.manageSessions') }}</div>
          </div>
          <div class="quick-action-item" @click="configureModels">
            <div class="quick-action-icon" style="background: rgba(208, 48, 80, 0.12); color: #d03050;">
              <NIcon :size="22" :component="SparklesOutline" />
            </div>
            <div class="quick-action-label">{{ t('pages.hermesDashboard.quickActions.configureModels') }}</div>
          </div>
          <div class="quick-action-item" @click="systemSettings">
            <div class="quick-action-icon" style="background: rgba(139, 92, 246, 0.12); color: #8b5cf6;">
              <NIcon :size="22" :component="SettingsOutline" />
            </div>
            <div class="quick-action-label">{{ t('pages.hermesDashboard.quickActions.systemSettings') }}</div>
          </div>
        </div>
      </NCard>
    </div>
  </NSpin>
</template>

<style scoped>
.hermes-dashboard {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---- Hero Card ---- */

.hermes-hero {
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 84% 16%, rgba(42, 127, 255, 0.22), transparent 36%),
    linear-gradient(120deg, var(--bg-card), rgba(42, 127, 255, 0.08));
  border: 1px solid rgba(42, 127, 255, 0.18);
}

.hermes-hero-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.hermes-hero-info {
  flex: 1;
  min-width: 200px;
}

.hermes-hero-title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.hermes-hero-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
}

.hermes-hero-details {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.hero-detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hero-detail-item .n-text {
  font-size: 13px;
}

.hero-detail-item .n-text strong,
.hero-detail-item .n-text[class*="strong"] {
  font-size: 15px;
}

/* ---- Connection Indicator ---- */

.connection-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.connection-indicator.success {
  background: rgba(24, 160, 88, 0.12);
  color: #18a058;
}

.connection-indicator.warning {
  background: rgba(240, 160, 32, 0.12);
  color: #f0a020;
}

.connection-indicator.error {
  background: rgba(208, 48, 80, 0.12);
  color: #d03050;
}

.connection-indicator.default {
  background: rgba(150, 150, 150, 0.12);
  color: #999;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}

.connection-indicator.success .connection-dot {
  background: #18a058;
  box-shadow: 0 0 6px rgba(24, 160, 88, 0.5);
}

.connection-indicator.warning .connection-dot {
  background: #f0a020;
  box-shadow: 0 0 6px rgba(240, 160, 32, 0.5);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.connection-indicator.error .connection-dot {
  background: #d03050;
  box-shadow: 0 0 6px rgba(208, 48, 80, 0.5);
}

.connection-indicator.default .connection-dot {
  background: #999;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ---- Stat Cards ---- */

.stat-card {
  border-radius: var(--radius-lg);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
}

.stat-card--sessions {
  background: linear-gradient(135deg, rgba(24, 160, 88, 0.08), rgba(24, 160, 88, 0.02));
  border: 1px solid rgba(24, 160, 88, 0.15);
}

.stat-card--messages {
  background: linear-gradient(135deg, rgba(42, 127, 255, 0.08), rgba(42, 127, 255, 0.02));
  border: 1px solid rgba(42, 127, 255, 0.15);
}

.stat-card--models {
  background: linear-gradient(135deg, rgba(208, 48, 80, 0.08), rgba(208, 48, 80, 0.02));
  border: 1px solid rgba(208, 48, 80, 0.15);
}

.stat-card--skills {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(139, 92, 246, 0.02));
  border: 1px solid rgba(139, 92, 246, 0.15);
}

.stat-card-inner {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stat-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-card-content {
  flex: 1;
  min-width: 0;
}

.stat-card-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-card-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* ---- Cards ---- */

.hermes-card {
  border-radius: var(--radius-lg);
}

/* ---- Active Model ---- */

.active-model-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.active-model-name {
  font-size: 16px;
  font-weight: 600;
}

.active-model-desc {
  font-size: 13px;
  line-height: 1.5;
}

.active-model-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
}

/* ---- Quick Actions ---- */

.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.quick-action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}

.quick-action-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  border-color: rgba(42, 127, 255, 0.3);
}

.quick-action-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-action-label {
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
}

/* ---- Responsive ---- */

@media (max-width: 900px) {
  .hermes-hero-details {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .quick-actions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .quick-actions-grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* ---- Usage Analytics ---- */

.usage-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 40px;
}

.usage-stat-card {
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(42, 127, 255, 0.06), rgba(42, 127, 255, 0.02));
  border: 1px solid rgba(42, 127, 255, 0.12);
}

.usage-stat-card--cost {
  background: linear-gradient(135deg, rgba(24, 160, 88, 0.06), rgba(24, 160, 88, 0.02));
  border: 1px solid rgba(24, 160, 88, 0.12);
}

.usage-stat-inner {
  display: flex;
  align-items: center;
  gap: 14px;
}

.usage-stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.usage-stat-content {
  flex: 1;
  min-width: 0;
}

.usage-stat-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.usage-stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.token-distribution {
  margin-top: 16px;
}

.segment-track {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-secondary);
  margin-bottom: 12px;
}

.segment-item {
  height: 100%;
  transition: width 0.3s ease;
}

.segment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.segment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.segment-row-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.segment-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}

.trend-chart-panel {
  position: relative;
  min-height: 200px;
}

.trend-chart-canvas {
  position: relative;
  width: 100%;
  height: 200px;
}

.trend-chart-svg {
  width: 100%;
  height: 100%;
}

.trend-grid-line {
  stroke: var(--border-color);
  stroke-dasharray: 4 4;
}

.trend-grid-label {
  fill: var(--text-tertiary);
  font-size: 10px;
  font-family: var(--mono);
}

.trend-area {
  fill: rgba(42, 127, 255, 0.1);
}

.trend-line {
  fill: none;
  stroke: #2a7fff;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trend-hover-line {
  stroke: rgba(42, 127, 255, 0.4);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.trend-point {
  fill: #2a7fff;
  stroke: var(--bg-card);
  stroke-width: 2;
  transition: r 0.15s ease;
}

.trend-point-active {
  fill: #2a7fff;
}

.trend-tooltip {
  position: absolute;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: var(--mono);
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.trend-axis-note {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: var(--mono);
}

.trend-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
