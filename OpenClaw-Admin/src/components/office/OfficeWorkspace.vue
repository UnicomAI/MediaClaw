<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { NCard, NButton, NIcon, NTooltip, NBadge, NText, NSpin } from 'naive-ui'
import { 
  AddOutline, 
  SettingsOutline, 
  ChatboxEllipsesOutline,
  RefreshOutline,
  PeopleOutline,
  CafeOutline,
  DesktopOutline,
  BedOutline,
} from '@vicons/ionicons5'
import { useOfficeStore } from '@/stores/office'
import { useAgentStore } from '@/stores/agent'
import { useSessionStore } from '@/stores/session'
import { useChatStore } from '@/stores/chat'
import type { OfficeAgent } from '@/stores/office'
import OfficeCharacter from './OfficeCharacter.vue'
import OfficeChatBubble from './OfficeChatBubble.vue'
import OfficeAreaLabel from './OfficeAreaLabel.vue'
import OfficeToolbar from './OfficeToolbar.vue'
import AgentChatPanel from './AgentChatPanel.vue'

interface Area {
  id: string
  name: string
  type: 'desk' | 'cafeteria' | 'lounge' | 'meeting'
  x: number
  y: number
  width: number
  height: number
  icon: typeof DesktopOutline
}

const officeStore = useOfficeStore()
const agentStore = useAgentStore()
const sessionStore = useSessionStore()
const chatStore = useChatStore()

const containerRef = ref<HTMLElement | null>(null)
const sceneWidth = ref(1200)
const sceneHeight = ref(800)
const scale = ref(1)

const selectedCharacterId = ref<string | null>(null)
const showChatPanel = ref(false)
const chatPanelSessionKey = ref<string | null>(null)

const areas: Area[] = [
  { id: 'desk-1', name: '工位区 A', type: 'desk', x: 50, y: 100, width: 300, height: 200, icon: DesktopOutline },
  { id: 'desk-2', name: '工位区 B', type: 'desk', x: 50, y: 350, width: 300, height: 200, icon: DesktopOutline },
  { id: 'desk-3', name: '工位区 C', type: 'desk', x: 850, y: 100, width: 300, height: 200, icon: DesktopOutline },
  { id: 'desk-4', name: '工位区 D', type: 'desk', x: 850, y: 350, width: 300, height: 200, icon: DesktopOutline },
  { id: 'cafeteria', name: '茶水间', type: 'cafeteria', x: 400, y: 50, width: 400, height: 150, icon: CafeOutline },
  { id: 'lounge', name: '休息室', type: 'lounge', x: 400, y: 550, width: 400, height: 200, icon: BedOutline },
  { id: 'meeting', name: '会议室', type: 'meeting', x: 450, y: 280, width: 300, height: 200, icon: PeopleOutline },
]

const characters = ref(new Map<string, {
  agentId: string
  x: number
  y: number
  targetX: number
  targetY: number
  area: string
  status: 'idle' | 'walking' | 'working' | 'talking' | 'resting'
  talkingTo: string | null
}>())

const bubbles = ref(new Map<string, {
  fromAgentId: string
  toAgentId: string | null
  message: string
  x: number
  y: number
  visible: boolean
}>())

function initCharacters() {
  const map = new Map()
  const agents = officeStore.officeAgents
  
  agents.forEach((agent, index) => {
    const areaIndex = index % areas.length
    const area = areas[areaIndex]
    if (!area) return
    
    const offsetX = (index % 2) * 100 + 50
    const offsetY = Math.floor(index / 4) * 80 + 40
    
    map.set(agent.id, {
      agentId: agent.id,
      x: area.x + offsetX,
      y: area.y + offsetY,
      targetX: area.x + offsetX,
      targetY: area.y + offsetY,
      area: area.id,
      status: agent.status === 'working' ? 'working' : 'idle',
      talkingTo: null,
    })
  })
  
  characters.value = map
}

function getCharacterPosition(agentId: string): { x: number; y: number } {
  const char = characters.value?.get(agentId)
  return char ? { x: char.x, y: char.y } : { x: 0, y: 0 }
}

function handleSceneClick(event: MouseEvent) {
  if (!containerRef.value) return
  
  const rect = containerRef.value.getBoundingClientRect()
  const x = (event.clientX - rect.left) / scale.value
  const y = (event.clientY - rect.top) / scale.value
  
  const clickedArea = areas.find(area => 
    x >= area.x && x <= area.x + area.width &&
    y >= area.y && y <= area.y + area.height
  )
  
  if (clickedArea && selectedCharacterId.value) {
    moveCharacterToArea(selectedCharacterId.value, clickedArea.id, x, y)
  }
}

function moveCharacterToArea(agentId: string, areaId: string, targetX: number, targetY: number) {
  const char = characters.value?.get(agentId)
  if (!char) return
  
  const area = areas.find(a => a.id === areaId)
  if (!area) return
  
  const clampedX = Math.max(area.x + 30, Math.min(area.x + area.width - 30, targetX))
  const clampedY = Math.max(area.y + 30, Math.min(area.y + area.height - 30, targetY))
  
  char.targetX = clampedX
  char.targetY = clampedY
  char.status = 'walking'
  char.area = areaId
}

function handleCharacterClick(agentId: string, event: MouseEvent) {
  event.stopPropagation()
  
  if (selectedCharacterId.value === agentId) {
    selectedCharacterId.value = null
  } else {
    selectedCharacterId.value = agentId
  }
}

function handleCharacterDoubleClick(agentId: string, event: MouseEvent) {
  event.stopPropagation()
  
  const agent = officeStore.officeAgents.find(a => a.id === agentId)
  if (!agent) return
  
  officeStore.selectAgent(agentId)
  
  const sessions = sessionStore.sessions.filter(s => s.agentId === agentId)
  if (sessions.length > 0) {
    const recentSession = sessions.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    )[0]
    if (recentSession) {
      chatPanelSessionKey.value = recentSession.key
      officeStore.selectSession(recentSession.key)
      showChatPanel.value = true
    }
  }
}

function startConversation(fromAgentId: string, toAgentId: string, message: string) {
  const fromChar = characters.value?.get(fromAgentId)
  const toChar = characters.value?.get(toAgentId)
  
  if (!fromChar || !toChar) return
  
  const midX = (fromChar.x + toChar.x) / 2
  const midY = Math.min(fromChar.y, toChar.y) - 30
  
  fromChar.status = 'talking'
  fromChar.talkingTo = toAgentId
  toChar.status = 'talking'
  toChar.talkingTo = fromAgentId
  
  const bubbleId = `${fromAgentId}-${toAgentId}-${Date.now()}`
  bubbles.value?.set(bubbleId, {
    fromAgentId,
    toAgentId,
    message,
    x: midX,
    y: midY,
    visible: true,
  })
  
  setTimeout(() => {
    bubbles.value?.delete(bubbleId)
    if (fromChar.talkingTo === toAgentId) {
      fromChar.status = 'idle'
      fromChar.talkingTo = null
    }
    if (toChar.talkingTo === fromAgentId) {
      toChar.status = 'idle'
      toChar.talkingTo = null
    }
  }, 5000)
}

let animationFrame: number | null = null

function updatePositions() {
  if (!characters.value) return
  
  characters.value.forEach((char) => {
    if (char.status === 'walking') {
      const dx = char.targetX - char.x
      const dy = char.targetY - char.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      if (dist < 2) {
        char.x = char.targetX
        char.y = char.targetY
        
        const area = areas.find(a => a.id === char.area)
        if (area) {
          char.status = area.type === 'desk' ? 'working' : 
                        area.type === 'lounge' ? 'resting' : 'idle'
        } else {
          char.status = 'idle'
        }
      } else {
        const speed = 2
        char.x += (dx / dist) * speed
        char.y += (dy / dist) * speed
      }
    }
  })
  
  animationFrame = requestAnimationFrame(updatePositions)
}

function handleResize() {
  if (!containerRef.value) return
  
  const containerWidth = containerRef.value.clientWidth
  const containerHeight = containerRef.value.clientHeight
  
  scale.value = Math.min(
    containerWidth / sceneWidth.value,
    containerHeight / sceneHeight.value,
    1
  )
}

const agents = computed(() => officeStore.officeAgents)

const activeCount = computed(() => 
  agents.value.filter(a => a.status === 'working').length
)

const totalTokens = computed(() =>
  agents.value.reduce((sum, a) => sum + a.totalTokens, 0)
)

watch(() => officeStore.officeAgents, () => {
  initCharacters()
}, { immediate: true, deep: true })

watch(() => chatStore.sessionKey, (newSessionKey) => {
  if (!newSessionKey) return
  
  const match = newSessionKey.match(/^agent:([^:]+):/)
  if (!match || !match[1]) return
  
  const agentId = match[1]
  
  // 监听这个智能体的状态变化
  const unwatch = watch(() => {
    const agentStatus = chatStore.getOrCreateAgentStatus(agentId)
    return agentStatus.phase
  }, (newPhase) => {
    if (selectedCharacterId.value && characters.value) {
      const char = characters.value.get(selectedCharacterId.value)
      if (char) {
        if (newPhase === 'idle' || newPhase === 'done' || newPhase === 'error') {
          if (char.status !== 'walking') {
            char.status = 'idle'
          }
        } else if (newPhase === 'thinking' || newPhase === 'replying' || newPhase === 'tool') {
          char.status = 'working'
        }
      }
    }
  })
  
  // 清理函数
  return () => unwatch()
})

onMounted(() => {
  initCharacters()
  handleResize()
  updatePositions()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
  window.removeEventListener('resize', handleResize)
})

function handleCreateAgent() {
  officeStore.selectAgent(null)
}

function handleRefresh() {
  officeStore.loadOfficeData()
}

function handleCloseChatPanel() {
  showChatPanel.value = false
}
</script>

<template>
  <div class="office-workspace">
    <OfficeToolbar
      :active-count="activeCount"
      :total-agents="agents.length"
      :total-tokens="totalTokens"
      @create-agent="handleCreateAgent"
      @refresh="handleRefresh"
    />
    
    <div 
      ref="containerRef" 
      class="office-scene-container"
      @click="handleSceneClick"
    >
      <div 
        class="office-scene"
        :style="{
          width: `${sceneWidth}px`,
          height: `${sceneHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }"
      >
        <div class="office-floor"></div>
        
        <OfficeAreaLabel
          v-for="area in areas"
          :key="area.id"
          :area="area"
        />
        
        <OfficeCharacter
          v-for="[agentId, char] in characters"
          :key="agentId"
          :agent="agents.find(a => a.id === agentId)"
          :x="char.x"
          :y="char.y"
          :status="char.status"
          :selected="selectedCharacterId === agentId"
          :talking-to="char.talkingTo"
          @click="handleCharacterClick(agentId, $event)"
          @dblclick="handleCharacterDoubleClick(agentId, $event)"
        />
        
        <OfficeChatBubble
          v-for="[bubbleId, bubble] in bubbles"
          :key="bubbleId"
          :x="bubble.x"
          :y="bubble.y"
          :message="bubble.message"
          :visible="bubble.visible"
        />
      </div>
    </div>
    
    <Transition name="slide">
      <div v-if="showChatPanel" class="chat-panel-overlay">
        <AgentChatPanel
          :selected-agent="officeStore.selectedAgent"
          :selected-session-key="chatPanelSessionKey"
          @close="handleCloseChatPanel"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.office-workspace {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color, #1a1a2e);
  position: relative;
  overflow: hidden;
}

.office-scene-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  cursor: crosshair;
}

.office-scene {
  position: relative;
  background: linear-gradient(180deg, #2d2d44 0%, #1a1a2e 100%);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.3);
}

.office-floor {
  position: absolute;
  inset: 0;
  background: 
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 40px,
      rgba(255, 255, 255, 0.02) 40px,
      rgba(255, 255, 255, 0.02) 41px
    ),
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 40px,
      rgba(255, 255, 255, 0.02) 40px,
      rgba(255, 255, 255, 0.02) 41px
    );
  pointer-events: none;
}

.chat-panel-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 400px;
  background: var(--bg-color, #1a1a2e);
  border-left: 1px solid var(--border-color, #333);
  z-index: 100;
  overflow: hidden;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
