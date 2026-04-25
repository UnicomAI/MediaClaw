import { createI18n } from 'vue-i18n'
import zhCN from './messages/zh-CN'
import enUS from './messages/en-US'
import { getPreferredLocale, type AppLocale } from './locale'

const DEFAULT_LOCALE: AppLocale = 'en-US'

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: getPreferredLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

