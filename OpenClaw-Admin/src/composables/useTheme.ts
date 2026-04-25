import { computed } from 'vue'
import { darkTheme } from 'naive-ui'
import { useThemeStore } from '@/stores/theme'

export function useTheme() {
  const themeStore = useThemeStore()

  const naiveTheme = computed(() =>
    themeStore.mode === 'dark' ? darkTheme : null
  )

  const isDark = computed(() => themeStore.mode === 'dark')

  return {
    theme: naiveTheme,
    mode: computed(() => themeStore.mode),
    isDark,
    toggle: themeStore.toggle,
  }
}
