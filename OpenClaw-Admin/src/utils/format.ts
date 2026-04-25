import { getPreferredLocale, type AppLocale } from '@/i18n/locale'

function normalizeDateInput(date: string | number | Date): Date | null {
  if (date instanceof Date) {
    return Number.isFinite(date.getTime()) ? date : null
  }

  if (typeof date === 'number') {
    const maybeMs = Math.abs(date) < 1_000_000_000_000 ? date * 1000 : date
    const parsed = new Date(maybeMs)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }

  const raw = date.trim()
  if (!raw) return null

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw)
    if (Number.isFinite(numeric)) {
      const maybeMs = Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric
      const parsed = new Date(maybeMs)
      if (Number.isFinite(parsed.getTime())) return parsed
    }
  }

  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

export function formatDate(date: string | number | Date): string {
  const parsed = normalizeDateInput(date)
  if (!parsed) {
    return typeof date === 'string' && date.trim() ? date : '-'
  }

  return parsed.toLocaleString(getPreferredLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Shanghai',
  })
}

export function formatDateShort(date: string | number | Date): string {
  const parsed = normalizeDateInput(date)
  if (!parsed) {
    return typeof date === 'string' && date.trim() ? date : '-'
  }

  return parsed.toLocaleString(getPreferredLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  })
}

export function formatRelativeTime(date: string | number | Date): string {
  const parsed = normalizeDateInput(date)
  if (!parsed) {
    return typeof date === 'string' && date.trim() ? date : '-'
  }

  const locale: AppLocale = getPreferredLocale()
  const now = Date.now()
  const diff = now - parsed.getTime()
  if (diff < 0) {
    const ahead = Math.abs(diff)
    if (locale === 'zh-CN') {
      if (ahead < 60000) return '即将'
      if (ahead < 3600000) return `${Math.ceil(ahead / 60000)} 分钟后`
      if (ahead < 86400000) return `${Math.ceil(ahead / 3600000)} 小时后`
      if (ahead < 2592000000) return `${Math.ceil(ahead / 86400000)} 天后`
    } else {
      if (ahead < 60000) return 'Soon'
      if (ahead < 3600000) return `in ${Math.ceil(ahead / 60000)} min`
      if (ahead < 86400000) return `in ${Math.ceil(ahead / 3600000)} hr`
      if (ahead < 2592000000) return `in ${Math.ceil(ahead / 86400000)} day`
    }
    return formatDate(date)
  }

  if (locale === 'zh-CN') {
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    if (diff < 172800000) return '昨天'
    if (diff < 2592000000) return `${Math.floor(diff / 86400000)} 天前`
  } else {
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`
    if (diff < 172800000) return 'Yesterday'
    if (diff < 2592000000) return `${Math.floor(diff / 86400000)} day ago`
  }
  return formatDate(date)
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

const SESSION_CHANNEL_ALIASES: Record<string, string> = {
  qq: 'qqbot',
  qqbot: 'qqbot',
  'feishu-china': 'feishu',
  'wecom-app': 'wecom',
  webchat: 'main',
}

function normalizeSessionChannel(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (!value) return 'main'
  return SESSION_CHANNEL_ALIASES[value] || value
}

export function parseSessionKey(key: string): { agent: string; channel: string; peer: string } {
  const raw = key.trim()
  if (!raw) {
    return {
      agent: 'main',
      channel: 'main',
      peer: '',
    }
  }

  const lowered = raw.toLowerCase()
  if (lowered === 'main') {
    return {
      agent: 'main',
      channel: 'main',
      peer: '',
    }
  }
  if (lowered === 'global') {
    return {
      agent: 'main',
      channel: 'global',
      peer: '',
    }
  }
  if (lowered === 'unknown') {
    return {
      agent: 'main',
      channel: 'unknown',
      peer: '',
    }
  }

  const parts = raw.split(':').filter(Boolean)
  if (parts.length === 0) {
    return {
      agent: 'main',
      channel: 'main',
      peer: '',
    }
  }

  // Canonical OpenClaw form: agent:<agentId>:<rest...>
  if (parts[0] === 'agent' && parts.length >= 3) {
    const agent = parts[1] || 'main'
    const rest = parts.slice(2)
    const head = rest[0]?.toLowerCase() || ''

    if (!head || head === 'main') {
      return {
        agent,
        channel: 'main',
        peer: rest.slice(1).join(':'),
      }
    }

    if (head === 'direct') {
      return {
        agent,
        channel: 'main',
        peer: rest.slice(1).join(':'),
      }
    }

    if (head === 'cron' || head === 'subagent' || head === 'acp') {
      return {
        agent,
        channel: head,
        peer: rest.slice(1).join(':'),
      }
    }

    const second = rest[1]?.toLowerCase() || ''
    const third = rest[2]?.toLowerCase() || ''

    if (second === 'direct' || second === 'group' || second === 'channel') {
      return {
        agent,
        channel: normalizeSessionChannel(head),
        peer: rest.slice(2).join(':'),
      }
    }

    if (third === 'direct' || third === 'group' || third === 'channel') {
      return {
        agent,
        channel: normalizeSessionChannel(head),
        peer: rest.slice(3).join(':'),
      }
    }

    return {
      agent,
      channel: normalizeSessionChannel(head),
      peer: rest.slice(1).join(':'),
    }
  }

  // Legacy or alias forms.
  if (parts[0] === 'cron') {
    return {
      agent: 'main',
      channel: 'cron',
      peer: parts.slice(1).join(':'),
    }
  }

  if (parts[0] === 'direct') {
    return {
      agent: 'main',
      channel: 'main',
      peer: parts.slice(1).join(':'),
    }
  }

  if (parts.length >= 2) {
    return {
      agent: parts[0] || 'main',
      channel: normalizeSessionChannel(parts[1] || 'main'),
      peer: parts.slice(2).join(':'),
    }
  }

  return {
    agent: 'main',
    channel: 'main',
    peer: '',
  }
}

export function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
