import { onUnmounted, ref, watch, type Ref } from 'vue'

export interface UseResizableOptions {
  minWidth?: number
  maxWidth?: number
  defaultWidth?: number
  storageKey?: string
  direction?: 'left' | 'right'
}

export function useResizable(
  containerRef: Ref<HTMLElement | null>,
  options: UseResizableOptions = {}
) {
  const {
    minWidth = 300,
    maxWidth = 800,
    defaultWidth = 420,
    storageKey,
    direction = 'left',
  } = options

  const width = ref(defaultWidth)
  const isResizing = ref(false)

  if (storageKey) {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
        width.value = parsed
      }
    }
  }

  let startX = 0
  let startWidth = 0
  let isListenerAdded = false

  function handleMouseDown(e: MouseEvent) {
    if (!containerRef.value) return

    const rect = containerRef.value.getBoundingClientRect()
    const resizeZone = 8

    const isInResizeZone =
      direction === 'left'
        ? e.clientX >= rect.left && e.clientX <= rect.left + resizeZone
        : e.clientX <= rect.right && e.clientX >= rect.right - resizeZone

    if (!isInResizeZone) return

    e.preventDefault()
    isResizing.value = true
    startX = e.clientX
    startWidth = width.value

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing.value) return

    const deltaX = direction === 'left' ? startX - e.clientX : e.clientX - startX
    let newWidth = startWidth + deltaX

    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
    width.value = newWidth
  }

  function handleMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''

    if (storageKey) {
      localStorage.setItem(storageKey, String(width.value))
    }
  }

  function handleMouseOver(e: MouseEvent) {
    if (!containerRef.value || isResizing.value) return

    const rect = containerRef.value.getBoundingClientRect()
    const resizeZone = 8

    const isInResizeZone =
      direction === 'left'
        ? e.clientX >= rect.left && e.clientX <= rect.left + resizeZone
        : e.clientX <= rect.right && e.clientX >= rect.right - resizeZone

    if (isInResizeZone) {
      document.body.style.cursor = 'ew-resize'
    }
  }

  function handleMouseLeave() {
    if (!isResizing.value) {
      document.body.style.cursor = ''
    }
  }

  function addListeners() {
    if (containerRef.value && !isListenerAdded) {
      containerRef.value.addEventListener('mousedown', handleMouseDown)
      containerRef.value.addEventListener('mouseover', handleMouseOver)
      containerRef.value.addEventListener('mouseleave', handleMouseLeave)
      isListenerAdded = true
    }
  }

  function removeListeners() {
    if (containerRef.value && isListenerAdded) {
      containerRef.value.removeEventListener('mousedown', handleMouseDown)
      containerRef.value.removeEventListener('mouseover', handleMouseOver)
      containerRef.value.removeEventListener('mouseleave', handleMouseLeave)
      isListenerAdded = false
    }
  }

  watch(containerRef, (newVal) => {
    if (newVal) {
      addListeners()
    }
  }, { immediate: true })

  onUnmounted(() => {
    removeListeners()
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  return {
    width,
    isResizing,
  }
}
