import { getPreferredLocale } from '@/i18n/locale'

const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|pwd|api[-_]?key|access[-_]?key|private[-_]?key|client[-_]?secret|app[-_]?secret|encrypt|aes|credential|bearer|cookie|signature|sign)$/i

export function isSecretFieldKey(key: string): boolean {
  const normalized = key.trim().replace(/\s+/g, '')
  if (!normalized) return false
  return SECRET_KEY_PATTERN.test(normalized)
}

export function hasSecretValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return true
  return false
}

export function maskSecretValue(value: unknown): string {
  if (!hasSecretValue(value)) return getPreferredLocale() === 'zh-CN' ? '未配置' : 'Not set'
  const text = String(value)
  if (text.length <= 4) return '****'
  return `${text.slice(0, 2)}****${text.slice(-2)}`
}

export function normalizeSecretInput(value: string): string | null {
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}
