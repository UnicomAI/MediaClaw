import type {
  Channel,
  ChannelAccountConfig,
  ChannelConfig,
  ConfigPatch,
} from '@/api/types'
import { isSecretFieldKey } from './secret-mask'

type JsonObject = Record<string, unknown>

const KNOWN_CHANNEL_KEYS = new Set([
  'enabled',
  'dmPolicy',
  'allowFrom',
  'groupPolicy',
  'requireMention',
  'groupAllowFrom',
  'groups',
  'appId',
  'markdownSupport',
  'accounts',
  'secretFields',
])

const KNOWN_ACCOUNT_KEYS = new Set([
  'enabled',
  'dmPolicy',
  'allowFrom',
  'groupPolicy',
  'requireMention',
  'groupAllowFrom',
  'groups',
])

export interface ChannelTemplate {
  key: string
  aliases: string[]
  label: string
  channelSecretFields: string[]
  accountSecretFields: string[]
  accountFields: string[]
}

export const CHANNEL_TEMPLATES: ChannelTemplate[] = [
  {
    key: 'qqbot',
    aliases: ['qq', 'qgbot', 'ntqq', 'onebot-qq'],
    label: 'QQ Bot',
    channelSecretFields: ['clientSecret'],
    accountSecretFields: ['clientSecret'],
    accountFields: ['appId'],
  },
  {
    key: 'dingtalk',
    aliases: ['ding'],
    label: '钉钉',
    channelSecretFields: ['clientSecret'],
    accountSecretFields: ['clientSecret'],
    accountFields: ['clientId'],
  },
  {
    key: 'wecom',
    aliases: ['wechatwork', 'wxwork', 'wecom-app'],
    label: '企业微信',
    channelSecretFields: ['secret'],
    accountSecretFields: ['secret', 'token', 'encodingAesKey', 'corpSecret'],
    accountFields: ['corpId', 'agentId'],
  },
  {
    key: 'wechat',
    aliases: ['wx'],
    label: '微信',
    channelSecretFields: ['appSecret', 'token'],
    accountSecretFields: ['appSecret', 'token', 'encodingAesKey'],
    accountFields: ['appId', 'corpId', 'agentId'],
  },
  {
    key: 'feishu',
    aliases: ['lark', 'feishu-china'],
    label: '飞书',
    channelSecretFields: ['appSecret'],
    accountSecretFields: ['appSecret', 'verificationToken', 'encryptKey'],
    accountFields: ['appId'],
  },
  {
    key: 'telegram',
    aliases: [],
    label: 'Telegram',
    channelSecretFields: ['botToken'],
    accountSecretFields: ['botToken'],
    accountFields: ['username', 'apiBase'],
  },
  {
    key: 'discord',
    aliases: [],
    label: 'Discord',
    channelSecretFields: ['botToken'],
    accountSecretFields: ['botToken', 'publicKey'],
    accountFields: ['applicationId'],
  },
]

function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cloneJsonValue<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false

    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false
      if (!deepEqual(a[key], b[key])) return false
    }
    return true
  }

  return false
}

export function normalizeChannelKey(raw: string): string {
  return raw.trim().toLowerCase()
}

function extractAccountFromChannelId(channelId: string, channelKey: string): string {
  const raw = channelId.trim()
  if (!raw || raw === channelKey) return ''

  const separators = [':', '/', '@', '#']
  for (const separator of separators) {
    if (!raw.includes(separator)) continue
    const tail = raw.split(separator).pop()?.trim() || ''
    if (tail && tail !== channelKey) return tail
  }

  if (raw.startsWith(`${channelKey}.`)) {
    const tail = raw.slice(channelKey.length + 1).trim()
    if (tail) return tail
  }

  return ''
}

export function deriveChannelKey(channel: Channel): string {
  const explicit = normalizeChannelKey(String(channel.channelKey || ''))
  if (explicit) return explicit

  const platform = normalizeChannelKey(String(channel.platform || ''))
  if (platform && platform !== 'unknown') return platform

  const id = String(channel.id || '').trim()
  if (!id) return 'unknown'

  for (const separator of [':', '/', '@']) {
    if (id.includes(separator)) {
      const head = normalizeChannelKey(id.split(separator)[0] || '')
      if (head) return head
    }
  }

  return normalizeChannelKey(id)
}

export function deriveAccountId(channel: Channel): string {
  const explicit = String(channel.accountId || '').trim()
  if (explicit) return explicit

  const fromName = String(channel.accountName || '').trim()
  if (fromName) return fromName

  const channelKey = deriveChannelKey(channel)
  const fromId = extractAccountFromChannelId(String(channel.id || ''), channelKey)
  if (fromId) return fromId

  return 'default'
}

export function cloneChannelConfigs(
  channels?: Record<string, ChannelConfig>
): Record<string, ChannelConfig> {
  if (!channels) return {}
  return cloneJsonValue(channels)
}

export function ensureChannelConfig(
  channels: Record<string, ChannelConfig>,
  channelKey: string
): ChannelConfig {
  const key = normalizeChannelKey(channelKey)
  if (!channels[key] || !isPlainObject(channels[key])) {
    channels[key] = { enabled: true }
  }
  return channels[key]
}

function asAccountsRecord(value: unknown): Record<string, ChannelAccountConfig> {
  if (!isPlainObject(value)) return {}
  const result: Record<string, ChannelAccountConfig> = {}
  for (const [key, accountValue] of Object.entries(value)) {
    if (!isPlainObject(accountValue)) continue
    result[key] = accountValue as ChannelAccountConfig
  }
  return result
}

export function ensureAccountConfig(
  channels: Record<string, ChannelConfig>,
  channelKey: string,
  accountId: string
): ChannelAccountConfig {
  const channelConfig = ensureChannelConfig(channels, channelKey)
  const accounts = asAccountsRecord(channelConfig.accounts)
  if (!accounts[accountId]) {
    accounts[accountId] = { enabled: true }
  }
  channelConfig.accounts = accounts
  return accounts[accountId]
}

export function removeAccountConfig(
  channels: Record<string, ChannelConfig>,
  channelKey: string,
  accountId: string
): void {
  const channelConfig = ensureChannelConfig(channels, channelKey)
  const accounts = asAccountsRecord(channelConfig.accounts)
  if (!accounts[accountId]) return
  delete accounts[accountId]
  channelConfig.accounts = accounts
}

function diffChannelNode(
  beforeValue: unknown,
  afterValue: unknown,
  path: string,
  patches: ConfigPatch[]
): void {
  if (deepEqual(beforeValue, afterValue)) return

  if (path.endsWith('.accounts')) {
    if (isPlainObject(beforeValue) && isPlainObject(afterValue)) {
      const beforeKeys = Object.keys(beforeValue).sort()
      const afterKeys = Object.keys(afterValue).sort()
      const sameKeys =
        beforeKeys.length === afterKeys.length &&
        beforeKeys.every((key, index) => key === afterKeys[index])

      if (!sameKeys) {
        patches.push({
          path,
          value: cloneJsonValue(afterValue ?? {}),
        })
        return
      }

      for (const accountId of afterKeys) {
        diffChannelNode(
          beforeValue[accountId],
          afterValue[accountId],
          `${path}.${accountId}`,
          patches
        )
      }
      return
    }

    patches.push({
      path,
      value: cloneJsonValue(afterValue ?? {}),
    })
    return
  }

  if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
    patches.push({
      path,
      value: cloneJsonValue(afterValue),
    })
    return
  }

  if (!isPlainObject(beforeValue) || !isPlainObject(afterValue)) {
    patches.push({
      path,
      value: cloneJsonValue(afterValue),
    })
    return
  }

  const mergedKeys = Array.from(
    new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)])
  ).sort()

  for (const key of mergedKeys) {
    const beforeHasKey = Object.prototype.hasOwnProperty.call(beforeValue, key)
    const afterHasKey = Object.prototype.hasOwnProperty.call(afterValue, key)
    const childPath = `${path}.${key}`

    if (!afterHasKey) {
      patches.push({ path: childPath, value: null })
      continue
    }

    if (!beforeHasKey) {
      patches.push({
        path: childPath,
        value: cloneJsonValue((afterValue as JsonObject)[key]),
      })
      continue
    }

    diffChannelNode((beforeValue as JsonObject)[key], (afterValue as JsonObject)[key], childPath, patches)
  }
}

export function buildChannelPatches(
  beforeChannels: Record<string, ChannelConfig>,
  afterChannels: Record<string, ChannelConfig>
): ConfigPatch[] {
  const patches: ConfigPatch[] = []
  const channelKeys = Array.from(
    new Set([...Object.keys(beforeChannels), ...Object.keys(afterChannels)])
  ).sort()

  for (const channelKey of channelKeys) {
    const path = `channels.${channelKey}`
    const beforeValue = beforeChannels[channelKey]
    const afterValue = afterChannels[channelKey]

    if (afterValue === undefined) {
      patches.push({ path, value: null })
      continue
    }

    if (beforeValue === undefined) {
      patches.push({ path, value: cloneJsonValue(afterValue) })
      continue
    }

    diffChannelNode(beforeValue, afterValue, path, patches)
  }

  return patches
}

export function resolveChannelTemplate(channelKey: string): ChannelTemplate | null {
  const normalized = normalizeChannelKey(channelKey)
  if (!normalized) return null

  for (const template of CHANNEL_TEMPLATES) {
    if (template.key === normalized) return template
    if (template.aliases.includes(normalized)) return template
    if (normalized.startsWith(`${template.key}-`) || normalized.startsWith(`${template.key}_`)) {
      return template
    }
  }

  return null
}

export function collectSecretFieldKeys(
  value: Record<string, unknown>,
  fallbackKeys: string[] = []
): string[] {
  const keys = new Set<string>()
  for (const key of fallbackKeys) {
    if (key.trim()) keys.add(key.trim())
  }

  for (const key of Object.keys(value)) {
    if (isSecretFieldKey(key)) {
      keys.add(key)
    }
  }

  return Array.from(keys).sort()
}

export function extractAdvancedChannelJson(
  channelConfig: ChannelConfig
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(channelConfig)) {
    if (KNOWN_CHANNEL_KEYS.has(key)) continue
    if (isSecretFieldKey(key)) continue
    result[key] = cloneJsonValue(value)
  }
  return result
}

export function applyAdvancedChannelJson(
  channelConfig: ChannelConfig,
  advancedJson: Record<string, unknown>
): ChannelConfig {
  const next = cloneJsonValue(channelConfig)

  for (const key of Object.keys(next)) {
    if (KNOWN_CHANNEL_KEYS.has(key)) continue
    if (isSecretFieldKey(key)) continue
    delete (next as Record<string, unknown>)[key]
  }

  for (const [key, value] of Object.entries(advancedJson)) {
    if (KNOWN_CHANNEL_KEYS.has(key)) continue
    if (isSecretFieldKey(key)) continue
    ;(next as Record<string, unknown>)[key] = cloneJsonValue(value)
  }

  return next
}

export function extractAdvancedAccountJson(
  accountConfig: ChannelAccountConfig
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(accountConfig)) {
    if (KNOWN_ACCOUNT_KEYS.has(key)) continue
    if (isSecretFieldKey(key)) continue
    result[key] = cloneJsonValue(value)
  }
  return result
}

export function applyAdvancedAccountJson(
  accountConfig: ChannelAccountConfig,
  advancedJson: Record<string, unknown>
): ChannelAccountConfig {
  const next = cloneJsonValue(accountConfig)

  for (const key of Object.keys(next)) {
    if (KNOWN_ACCOUNT_KEYS.has(key)) continue
    if (isSecretFieldKey(key)) continue
    delete (next as Record<string, unknown>)[key]
  }

  for (const [key, value] of Object.entries(advancedJson)) {
    if (KNOWN_ACCOUNT_KEYS.has(key)) continue
    if (isSecretFieldKey(key)) continue
    ;(next as Record<string, unknown>)[key] = cloneJsonValue(value)
  }

  return next
}
