<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  x: number
  y: number
  message: string
  visible: boolean
}>()

const showContent = ref(false)

watch(() => props.visible, (visible) => {
  if (visible) {
    setTimeout(() => {
      showContent.value = true
    }, 50)
  } else {
    showContent.value = false
  }
})

onMounted(() => {
  if (props.visible) {
    showContent.value = true
  }
})
</script>

<template>
  <Transition name="bubble">
    <div
      v-if="visible && showContent"
      class="chat-bubble"
      :style="{
        left: `${x}px`,
        top: `${y}px`,
      }"
    >
      <div class="bubble-content">
        <div class="bubble-tail left"></div>
        <div class="bubble-tail right"></div>
        <span class="bubble-text">{{ message }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.chat-bubble {
  position: absolute;
  transform: translate(-50%, -100%);
  z-index: 50;
  pointer-events: none;
}

.bubble-content {
  position: relative;
  background: rgba(255, 255, 255, 0.95);
  color: #333;
  padding: 8px 14px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 200px;
  word-wrap: break-word;
}

.bubble-tail {
  position: absolute;
  bottom: -6px;
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.95);
  transform: rotate(45deg);
}

.bubble-tail.left {
  left: 20px;
}

.bubble-tail.right {
  right: 20px;
}

.bubble-text {
  font-size: 12px;
  line-height: 1.4;
}

.bubble-enter-active {
  animation: bubble-in 0.3s ease-out;
}

.bubble-leave-active {
  animation: bubble-out 0.2s ease-in;
}

@keyframes bubble-in {
  0% {
    opacity: 0;
    transform: translate(-50%, -80%) scale(0.8);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -100%) scale(1);
  }
}

@keyframes bubble-out {
  0% {
    opacity: 1;
    transform: translate(-50%, -100%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -80%) scale(0.8);
  }
}
</style>
