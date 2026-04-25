<script setup lang="ts">
import { computed, ref } from 'vue'
import { NTooltip, NBadge } from 'naive-ui'
import type { OfficeAgent } from '@/stores/office'

interface Props {
  agent?: OfficeAgent
  x: number
  y: number
  status: 'idle' | 'walking' | 'working' | 'talking' | 'resting'
  selected?: boolean
  talkingTo?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  selected: false,
  talkingTo: null,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
  dblclick: [event: MouseEvent]
}>()

const isHovered = ref(false)

const statusColor = computed(() => {
  switch (props.status) {
    case 'working': return '#18a058'
    case 'walking': return '#2080f0'
    case 'talking': return '#f0a020'
    case 'resting': return '#909399'
    default: return '#909399'
  }
})

const statusText = computed(() => {
  switch (props.status) {
    case 'working': return '工作中'
    case 'walking': return '移动中'
    case 'talking': return '交谈中'
    case 'resting': return '休息中'
    default: return '空闲'
  }
})

const animationClass = computed(() => {
  if (props.status === 'walking') return 'walking'
  if (props.status === 'working') return 'working'
  if (props.status === 'talking') return 'talking'
  if (props.status === 'resting') return 'resting'
  return 'idle'
})

const initial = computed(() => {
  if (!props.agent) return '?'
  return (props.agent.emoji || props.agent.name || '?').charAt(0).toUpperCase()
})

const displayName = computed(() => {
  return props.agent?.name || props.agent?.id || 'Unknown'
})

function handleClick(event: MouseEvent) {
  emit('click', event)
}

function handleDblClick(event: MouseEvent) {
  emit('dblclick', event)
}
</script>

<template>
  <div
    class="office-character"
    :class="[
      animationClass,
      { selected, hovered: isHovered }
    ]"
    :style="{
      left: `${x}px`,
      top: `${y}px`,
    }"
    @click="handleClick"
    @dblclick="handleDblClick"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div class="character-shadow"></div>
    
    <div class="character-body">
      <div class="character-head">
        <div 
          class="character-face"
          :style="{ backgroundColor: agent?.color || '#667eea' }"
        >
          <span class="character-emoji">{{ agent?.emoji || '🤖' }}</span>
        </div>
        <div 
          v-if="status === 'working'" 
          class="working-indicator"
        >
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
      
      <div class="character-torso" :style="{ backgroundColor: agent?.color || '#667eea' }">
        <div class="character-arms left"></div>
        <div class="character-arms right"></div>
      </div>
      
      <div class="character-legs">
        <div class="character-leg left"></div>
        <div class="character-leg right"></div>
      </div>
    </div>
    
    <div class="character-status-bar">
      <div 
        class="status-indicator"
        :style="{ backgroundColor: statusColor }"
      ></div>
      <span class="status-text">{{ statusText }}</span>
    </div>
    
    <NTooltip :show="isHovered" placement="top" :delay="200">
      <template #trigger>
        <div class="tooltip-trigger"></div>
      </template>
      <div class="character-tooltip">
        <div class="tooltip-name">{{ displayName }}</div>
        <div class="tooltip-status">
          <span class="tooltip-status-dot" :style="{ backgroundColor: statusColor }"></span>
          {{ statusText }}
        </div>
        <div v-if="agent?.currentTask" class="tooltip-task">
          {{ agent.currentTask }}
        </div>
        <div class="tooltip-hint">双击打开聊天</div>
      </div>
    </NTooltip>
    
    <div v-if="selected" class="selection-ring"></div>
  </div>
</template>

<style scoped>
.office-character {
  position: absolute;
  transform: translate(-50%, -50%);
  cursor: pointer;
  transition: transform 0.1s ease;
  z-index: 10;
}

.office-character:hover {
  transform: translate(-50%, -50%) scale(1.05);
}

.office-character.selected {
  z-index: 20;
}

.character-shadow {
  position: absolute;
  bottom: -25px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 10px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  filter: blur(3px);
}

.character-body {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.character-head {
  position: relative;
  z-index: 2;
}

.character-face {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 
    0 2px 8px rgba(0, 0, 0, 0.3),
    inset 0 2px 4px rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.character-emoji {
  font-size: 18px;
  line-height: 1;
}

.working-indicator {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 3px;
  background: rgba(0, 0, 0, 0.7);
  padding: 2px 6px;
  border-radius: 8px;
}

.typing-dot {
  width: 4px;
  height: 4px;
  background: #18a058;
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
}

.character-torso {
  width: 28px;
  height: 24px;
  border-radius: 8px 8px 4px 4px;
  margin-top: -4px;
  position: relative;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.character-arms {
  position: absolute;
  width: 8px;
  height: 20px;
  background: inherit;
  border-radius: 4px;
  top: 2px;
  filter: brightness(0.9);
}

.character-arms.left {
  left: -6px;
  transform-origin: top center;
}

.character-arms.right {
  right: -6px;
  transform-origin: top center;
}

.character-legs {
  display: flex;
  gap: 4px;
  margin-top: -2px;
}

.character-leg {
  width: 10px;
  height: 16px;
  background: #444;
  border-radius: 4px;
}

.character-status-bar {
  position: absolute;
  bottom: -35px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.7);
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-text {
  font-size: 10px;
  color: #fff;
}

.tooltip-trigger {
  position: absolute;
  inset: -20px;
  z-index: 100;
  pointer-events: none;
}

.character-tooltip {
  padding: 4px 0;
}

.tooltip-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.tooltip-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #999;
}

.tooltip-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.tooltip-task {
  font-size: 11px;
  color: #666;
  margin-top: 4px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tooltip-hint {
  font-size: 10px;
  color: #555;
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px solid #333;
}

.selection-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 70px;
  height: 90px;
  border: 2px solid #2080f0;
  border-radius: 50%;
  animation: pulse-ring 2s infinite;
  pointer-events: none;
}

@keyframes pulse-ring {
  0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.1); }
}

/* Animation states */
.office-character.walking .character-leg.left {
  animation: walk-left 0.3s infinite;
}

.office-character.walking .character-leg.right {
  animation: walk-right 0.3s infinite;
}

.office-character.walking .character-arms.left {
  animation: arm-swing-left 0.3s infinite;
}

.office-character.walking .character-arms.right {
  animation: arm-swing-right 0.3s infinite;
}

@keyframes walk-left {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(15deg); }
}

@keyframes walk-right {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-15deg); }
}

@keyframes arm-swing-left {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-20deg); }
}

@keyframes arm-swing-right {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(20deg); }
}

.office-character.working .character-torso {
  animation: working-bounce 2s infinite ease-in-out;
}

@keyframes working-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

.office-character.talking .character-head {
  animation: talking-nod 0.5s infinite;
}

@keyframes talking-nod {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}

.office-character.resting .character-body {
  opacity: 0.7;
}

.office-character.resting .character-head {
  animation: resting-breathe 3s infinite ease-in-out;
}

@keyframes resting-breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
</style>
