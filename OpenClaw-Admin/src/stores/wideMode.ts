import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useWideModeStore = defineStore('wideMode', () => {
  const isWideMode = ref(false)

  function toggle() {
    isWideMode.value = !isWideMode.value
    updateBodyClass()
  }

  function setWideMode(value: boolean) {
    isWideMode.value = value
    updateBodyClass()
  }

  function updateBodyClass() {
    if (typeof document !== 'undefined') {
      if (isWideMode.value) {
        document.body.classList.add('wide-mode')
      } else {
        document.body.classList.remove('wide-mode')
      }
    }
  }

  return {
    isWideMode,
    toggle,
    setWideMode,
  }
})
