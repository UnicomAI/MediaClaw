import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { i18n } from '@/i18n'
import { getStoredLocale, getSystemLocale, saveLocale, type AppLocale } from '@/i18n/locale'

function applyLocale(locale: AppLocale) {
  i18n.global.locale.value = locale
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('lang', locale)
}

export const useLocaleStore = defineStore('locale', () => {
  const stored = getStoredLocale()
  const locale = ref<AppLocale>(stored || getSystemLocale())

  watch(locale, (val) => {
    applyLocale(val)
  }, { immediate: true })

  function setLocale(next: AppLocale, persist = true) {
    locale.value = next
    if (persist) saveLocale(next)
  }

  function toggle() {
    const next: AppLocale = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
    setLocale(next, true)
  }

  return { locale, setLocale, toggle }
})

