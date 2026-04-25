import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'openclaw_theme'

function getSystemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = defineStore('theme', () => {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
  const mode = ref<ThemeMode>(stored || 'dark')

  watch(mode, (val) => {
    localStorage.setItem(STORAGE_KEY, val)
    document.documentElement.setAttribute('data-theme', val)
  }, { immediate: true })

  function toggle() {
    mode.value = mode.value === 'light' ? 'dark' : 'light'
  }

  function setMode(m: ThemeMode) {
    mode.value = m
  }

  return { mode, toggle, setMode }
})
