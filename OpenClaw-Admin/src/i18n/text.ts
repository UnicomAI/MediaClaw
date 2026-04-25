import { getPreferredLocale, type AppLocale } from './locale'

export function getActiveLocale(): AppLocale {
  return getPreferredLocale()
}

export function byLocale(zhCN: string, enUS: string, locale: AppLocale = getPreferredLocale()): string {
  return locale === 'zh-CN' ? zhCN : enUS
}

