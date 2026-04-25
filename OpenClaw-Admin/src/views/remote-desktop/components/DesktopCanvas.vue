<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { NSpin, NAlert } from 'naive-ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
  width?: number
  height?: number
  scale?: number
  frameData?: string
}

const props = withDefaults(defineProps<Props>(), {
  width: 1024,
  height: 768,
  scale: 1,
  frameData: '',
})

const emit = defineEmits<{
  'mouse-move': [x: number, y: number]
  'mouse-click': [x: number, y: number, button: number]
  'mouse-wheel': [x: number, y: number, deltaX: number, deltaY: number]
  'keyboard-down': [event: KeyboardEvent]
  'keyboard-up': [event: KeyboardEvent]
  'clipboard-paste': [text: string]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)
const isFocused = ref(false)
const lastFrameTime = ref(0)
const fps = ref(0)
const frameCount = ref(0)

const canvasStyle = computed(() => ({
  width: `${props.width * props.scale}px`,
  height: `${props.height * props.scale}px`,
  cursor: isFocused.value ? 'default' : 'crosshair',
}))

function handleMouseMove(event: MouseEvent) {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = Math.round((event.clientX - rect.left) / props.scale)
  const y = Math.round((event.clientY - rect.top) / props.scale)
  emit('mouse-move', x, y)
}

function handleMouseDown(event: MouseEvent) {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = Math.round((event.clientX - rect.left) / props.scale)
  const y = Math.round((event.clientY - rect.top) / props.scale)
  emit('mouse-click', x, y, event.button)
  event.preventDefault()
}

function handleMouseUp(event: MouseEvent) {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = Math.round((event.clientX - rect.left) / props.scale)
  const y = Math.round((event.clientY - rect.top) / props.scale)
  emit('mouse-click', x, y, event.button)
}

function handleWheel(event: WheelEvent) {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const x = Math.round((event.clientX - rect.left) / props.scale)
  const y = Math.round((event.clientY - rect.top) / props.scale)
  emit('mouse-wheel', x, y, event.deltaX, event.deltaY)
  event.preventDefault()
}

function handleKeyDown(event: KeyboardEvent) {
  emit('keyboard-down', event)
  event.preventDefault()
}

function handleKeyUp(event: KeyboardEvent) {
  emit('keyboard-up', event)
  event.preventDefault()
}

function handleFocus() {
  isFocused.value = true
}

function handleBlur() {
  isFocused.value = false
}

async function handlePaste(event: ClipboardEvent) {
  const text = await navigator.clipboard.readText()
  if (text) {
    emit('clipboard-paste', text)
  }
  event.preventDefault()
}

function initCanvas() {
  if (!canvasRef.value) return

  isLoading.value = true
  error.value = null

  try {
    const ctx = canvasRef.value.getContext('2d', { alpha: false })
    if (ctx) {
      ctx.fillStyle = '#1e1e1e'
      ctx.fillRect(0, 0, props.width, props.height)
      ctx.fillStyle = '#666666'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(t('pages.remoteDesktop.hints.waitingForDesktop'), props.width / 2, props.height / 2)
    }
    isLoading.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to initialize canvas'
    isLoading.value = false
  }
}

let offscreenCanvas: HTMLCanvasElement | null = null
let offscreenCtx: CanvasRenderingContext2D | null = null

function drawFrame(base64Data: string) {
  if (!canvasRef.value || !base64Data) return

  const ctx = canvasRef.value.getContext('2d', { alpha: false })
  if (!ctx) return

  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas')
    offscreenCanvas.width = props.width
    offscreenCanvas.height = props.height
    offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false })
  }

  const img = new Image()
  img.onload = () => {
    if (offscreenCtx && offscreenCanvas) {
      offscreenCtx.drawImage(img, 0, 0, props.width, props.height)
      ctx.drawImage(offscreenCanvas, 0, 0)
    } else {
      ctx.drawImage(img, 0, 0, props.width, props.height)
    }
    isLoading.value = false
    
    frameCount.value++
    const now = performance.now()
    if (now - lastFrameTime.value >= 1000) {
      fps.value = frameCount.value
      frameCount.value = 0
      lastFrameTime.value = now
    }
  }
  img.onerror = () => {
    error.value = 'Failed to decode frame data'
  }
  
  if (base64Data.startsWith('data:image')) {
    img.src = base64Data
  } else {
    img.src = `data:image/jpeg;base64,${base64Data}`
  }
}

onMounted(() => {
  initCanvas()
  lastFrameTime.value = performance.now()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  offscreenCanvas = null
  offscreenCtx = null
})

watch(() => [props.width, props.height], () => {
  initCanvas()
  offscreenCanvas = null
  offscreenCtx = null
})

watch(() => props.frameData, (newData) => {
  if (newData) {
    drawFrame(newData)
  }
})

defineExpose({
  getCanvas: () => canvasRef.value,
})
</script>

<template>
  <div class="desktop-canvas-wrapper">
    <NSpin :show="isLoading">
      <NAlert
        v-if="error"
        type="error"
        :bordered="false"
        style="margin-bottom: 12px;"
      >
        {{ error }}
      </NAlert>
      <canvas
        ref="canvasRef"
        class="desktop-canvas"
        :style="canvasStyle"
        :width="width"
        :height="height"
        tabindex="0"
        @mousemove="handleMouseMove"
        @mousedown="handleMouseDown"
        @mouseup="handleMouseUp"
        @wheel="handleWheel"
        @focus="handleFocus"
        @blur="handleBlur"
        @paste="handlePaste"
        @contextmenu.prevent
      />
    </NSpin>
    <div v-if="!isFocused" class="canvas-focus-hint">
      {{ t('pages.remoteDesktop.hints.clickToFocus') }}
    </div>
    <div v-if="fps > 0" class="fps-counter">
      {{ fps }} FPS
    </div>
  </div>
</template>

<style scoped>
.desktop-canvas-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--bg-color, #1e1e1e);
  border-radius: 8px;
  overflow: hidden;
  min-height: 300px;
}

.desktop-canvas {
  display: block;
  background: var(--bg-color, #1e1e1e);
  border-radius: 4px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.desktop-canvas:focus {
  outline: 2px solid var(--primary-color, #18a058);
  outline-offset: 2px;
}

.canvas-focus-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
}

.fps-counter {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #0f0;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  pointer-events: none;
}
</style>
