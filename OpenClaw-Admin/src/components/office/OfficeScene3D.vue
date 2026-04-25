<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  NText,
  NIcon,
  NTag,
  NTooltip,
  NButton,
} from 'naive-ui'
import {
  PersonOutline,
  DesktopOutline,
  ChatbubbleEllipsesOutline,
  SyncOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useOfficeStore, type OfficeAgent } from '@/stores/office'
import AgentCharacter from './AgentCharacter.vue'

const { t } = useI18n()
const officeStore = useOfficeStore()

const sceneRef = ref<HTMLElement | null>(null)
const rotationX = ref(15)
const rotationY = ref(0)
const zoom = ref(1)
const isDragging = ref(false)
const lastMouseX = ref(0)
const lastMouseY = ref(0)

const agents = computed(() => officeStore.officeAgents)

const sceneStyle = computed(() => ({
  transform: `rotateX(${rotationX.value}deg) rotateY(${rotationY.value}deg) scale(${zoom.value})`,
}))

function handleMouseDown(event: MouseEvent) {
  isDragging.value = true
  lastMouseX.value = event.clientX
  lastMouseY.value = event.clientY
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value) return
  const deltaX = event.clientX - lastMouseX.value
  const deltaY = event.clientY - lastMouseY.value
  rotationY.value += deltaX * 0.5
  rotationX.value = Math.max(-60, Math.min(60, rotationX.value - deltaY * 0.5))
  lastMouseX.value = event.clientX
  lastMouseY.value = event.clientY
}

function handleMouseUp() {
  isDragging.value = false
}

function handleWheel(event: WheelEvent) {
  event.preventDefault()
  zoom.value = Math.max(0.5, Math.min(2, zoom.value - event.deltaY * 0.001))
}

function resetView() {
  rotationX.value = 15
  rotationY.value = 0
  zoom.value = 1
}

function handleAgentClick(agentId: string) {
  officeStore.selectAgent(agentId)
}

function getAgentPositionStyle(agent: OfficeAgent, index: number) {
  const total = agents.value.length
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  const radius = 180
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius
  
  return {
    transform: `translate3d(${x}px, 0, ${z}px) rotateY(${-rotationY.value}deg)`,
    '--agent-color': agent.color,
  }
}

onMounted(() => {
  window.addEventListener('mouseup', handleMouseUp)
  window.addEventListener('mousemove', handleMouseMove)
})

onUnmounted(() => {
  window.removeEventListener('mouseup', handleMouseUp)
  window.removeEventListener('mousemove', handleMouseMove)
})
</script>

<template>
  <div class="scene-3d-container">
    <div class="scene-controls">
      <NTooltip>
        <template #trigger>
          <NButton size="small" quaternary circle @click="resetView">
            <template #icon><NIcon :component="SyncOutline" /></template>
          </NButton>
        </template>
        {{ t('pages.office.3d.resetView') }}
      </NTooltip>
      <NText depth="3" style="font-size: 11px;">
        {{ t('pages.office.3d.hint') }}
      </NText>
    </div>

    <div
      ref="sceneRef"
      class="scene-3d"
      @mousedown="handleMouseDown"
      @wheel="handleWheel"
    >
      <div class="scene-floor">
        <div class="floor-grid"></div>
        <div class="floor-center"></div>
      </div>

      <div class="scene-agents" :style="sceneStyle">
        <div
          v-for="(agent, index) in agents"
          :key="agent.id"
          class="scene-agent"
          :class="{
            'is-selected': officeStore.selectedAgentId === agent.id,
            'is-working': agent.status === 'working',
          }"
          :style="getAgentPositionStyle(agent, index)"
          @click.stop="handleAgentClick(agent.id)"
        >
          <div class="scene-agent-avatar">
            <span v-if="agent.emoji" class="scene-agent-emoji">{{ agent.emoji }}</span>
            <div v-else class="scene-agent-initial" :style="{ background: agent.color }">
              {{ agent.name.charAt(0).toUpperCase() }}
            </div>
            <div class="scene-agent-status" :class="`status-${agent.status}`"></div>
          </div>
          
          <div class="scene-agent-label">
            <NText strong style="font-size: 12px;">{{ agent.name }}</NText>
          </div>

          <div v-if="agent.status === 'working'" class="scene-agent-desk">
            <NIcon :component="DesktopOutline" size="16" />
          </div>

          <div v-if="agent.status === 'communicating'" class="scene-agent-communication">
            <div class="comm-line comm-line-1"></div>
            <div class="comm-line comm-line-2"></div>
          </div>
        </div>
      </div>

      <div v-if="officeStore.selectedAgent" class="scene-selected-info">
        <div class="selected-agent-header">
          <span v-if="officeStore.selectedAgent.emoji" class="selected-emoji">
            {{ officeStore.selectedAgent.emoji }}
          </span>
          <NText strong>{{ officeStore.selectedAgent.name }}</NText>
          <NTag
            size="small"
            :type="officeStore.selectedAgent.status === 'working' ? 'success' : 'default'"
            :bordered="false"
            round
          >
            {{ officeStore.selectedAgent.status }}
          </NTag>
        </div>
        <div class="selected-agent-stats">
          <div class="stat-item">
            <NIcon :component="DesktopOutline" size="14" />
            <span>{{ officeStore.selectedAgent.sessionCount }} {{ t('pages.office.sessions') }}</span>
          </div>
          <div class="stat-item">
            <span>{{ officeStore.selectedAgent.totalTokens }} tokens</span>
          </div>
        </div>
        <div v-if="officeStore.selectedAgent.currentTask" class="selected-agent-task">
          <NText depth="3" style="font-size: 11px;">
            {{ t('pages.office.currentTask') }}: {{ officeStore.selectedAgent.currentTask }}
          </NText>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scene-3d-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  perspective: 1000px;
  overflow: hidden;
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
  border-radius: var(--radius-lg);
}

.scene-controls {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
  padding: 8px 12px;
  background: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.scene-3d {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-style: preserve-3d;
  cursor: grab;
}

.scene-3d:active {
  cursor: grabbing;
}

.scene-floor {
  position: absolute;
  width: 400px;
  height: 400px;
  transform: rotateX(90deg) translateZ(-100px);
  transform-style: preserve-3d;
}

.floor-grid {
  position: absolute;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(var(--border-color) 1px, transparent 1px),
    linear-gradient(90deg, var(--border-color) 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.3;
}

.floor-center {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 80px;
  height: 80px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, var(--primary-color) 0%, transparent 70%);
  opacity: 0.2;
}

.scene-agents {
  position: relative;
  width: 400px;
  height: 400px;
  transform-style: preserve-3d;
  transition: transform 0.1s ease-out;
}

.scene-agent {
  position: absolute;
  top: 50%;
  left: 50%;
  margin-left: -30px;
  margin-top: -60px;
  transform-style: preserve-3d;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.scene-agent:hover {
  transform: translate3d(var(--x, 0), -10px, var(--z, 0)) scale(1.1);
}

.scene-agent.is-selected {
  transform: translate3d(var(--x, 0), -15px, var(--z, 0)) scale(1.15);
}

.scene-agent-avatar {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 3px solid var(--agent-color);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.scene-agent-emoji {
  font-size: 28px;
}

.scene-agent-initial {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 20px;
}

.scene-agent-status {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 2px solid var(--bg-card);
}

.scene-agent-status.status-working {
  background: #18a058;
  animation: pulse-status 2s infinite;
}

.scene-agent-status.status-communicating {
  background: #2080f0;
  animation: pulse-status 1s infinite;
}

.scene-agent-status.status-idle {
  background: #909399;
}

.scene-agent-status.status-offline {
  background: #d03050;
}

@keyframes pulse-status {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.8); }
}

.scene-agent-label {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  white-space: nowrap;
  text-align: center;
  padding: 4px 8px;
  background: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
}

.scene-agent-desk {
  position: absolute;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 50px;
  height: 30px;
  background: var(--bg-secondary);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
}

.scene-agent-communication {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 40px;
}

.comm-line {
  position: absolute;
  width: 2px;
  height: 20px;
  background: #2080f0;
  opacity: 0.6;
  animation: comm-pulse 1s infinite;
}

.comm-line-1 {
  left: 10px;
  transform: rotate(-30deg);
  animation-delay: 0s;
}

.comm-line-2 {
  right: 10px;
  transform: rotate(30deg);
  animation-delay: 0.5s;
}

@keyframes comm-pulse {
  0%, 100% { opacity: 0.3; height: 15px; }
  50% { opacity: 1; height: 25px; }
}

.scene-selected-info {
  position: absolute;
  bottom: 16px;
  left: 16px;
  right: 16px;
  padding: 12px;
  background: var(--bg-card);
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  z-index: 10;
}

.selected-agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.selected-emoji {
  font-size: 24px;
}

.selected-agent-stats {
  display: flex;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.selected-agent-task {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
}
</style>
