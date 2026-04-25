<script setup lang="ts">
import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import { 
  DesktopOutline, 
  CafeOutline, 
  BedOutline, 
  PeopleOutline,
} from '@vicons/ionicons5'

interface Area {
  id: string
  name: string
  type: 'desk' | 'cafeteria' | 'lounge' | 'meeting' | 'hallway' | 'reception'
  x: number
  y: number
  width: number
  height: number
  icon?: typeof DesktopOutline
}

const props = defineProps<{
  area: Area
}>()

const areaColors: Record<string, { bg: string; border: string; label: string }> = {
  desk: { bg: 'rgba(102, 126, 234, 0.15)', border: 'rgba(102, 126, 234, 0.4)', label: '#667eea' },
  cafeteria: { bg: 'rgba(240, 160, 32, 0.15)', border: 'rgba(240, 160, 32, 0.4)', label: '#f0a020' },
  lounge: { bg: 'rgba(103, 232, 249, 0.15)', border: 'rgba(103, 232, 249, 0.4)', label: '#67e8f9' },
  meeting: { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)', label: '#a855f7' },
}

const defaultColors = { bg: 'rgba(102, 126, 234, 0.15)', border: 'rgba(102, 126, 234, 0.4)', label: '#667eea' }

const areaIcons: Record<string, typeof DesktopOutline> = {
  desk: DesktopOutline,
  cafeteria: CafeOutline,
  lounge: BedOutline,
  meeting: PeopleOutline,
}

const iconComponent = computed(() => props.area.icon || areaIcons[props.area.type] || DesktopOutline)
</script>

<template>
  <div
    class="office-area"
    :style="{
      left: `${area.x}px`,
      top: `${area.y}px`,
      width: `${area.width}px`,
      height: `${area.height}px`,
      backgroundColor: areaColors[area.type]?.bg || defaultColors.bg,
      borderColor: areaColors[area.type]?.border || defaultColors.border,
    }"
  >
    <div class="area-label" :style="{ color: areaColors[area.type]?.label || defaultColors.label }">
      <NIcon :size="14" :component="iconComponent" />
      <span class="area-name">{{ area.name }}</span>
    </div>
    
    <div v-if="area.type === 'desk'" class="desk-items">
      <div class="desk-item" v-for="i in 2" :key="i">
        <div class="monitor"></div>
        <div class="keyboard"></div>
      </div>
    </div>
    
    <div v-else-if="area.type === 'cafeteria'" class="cafeteria-items">
      <div class="coffee-machine"></div>
      <div class="water-dispenser"></div>
    </div>
    
    <div v-else-if="area.type === 'lounge'" class="lounge-items">
      <div class="sofa"></div>
      <div class="plant"></div>
    </div>
    
    <div v-else-if="area.type === 'meeting'" class="meeting-items">
      <div class="table"></div>
      <div class="chairs">
        <div class="chair" v-for="i in 4" :key="i"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.office-area {
  position: absolute;
  border: 2px dashed;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.office-area:hover {
  filter: brightness(1.1);
}

.area-label {
  position: absolute;
  top: 8px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  opacity: 0.8;
}

.area-name {
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Desk area items */
.desk-items {
  display: flex;
  gap: 40px;
  padding: 30px 20px;
}

.desk-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.monitor {
  width: 30px;
  height: 22px;
  background: #333;
  border-radius: 3px;
  border: 2px solid #555;
}

.keyboard {
  width: 25px;
  height: 8px;
  background: #444;
  border-radius: 2px;
}

/* Cafeteria items */
.cafeteria-items {
  display: flex;
  gap: 30px;
  padding: 25px 30px;
  justify-content: center;
}

.coffee-machine {
  width: 25px;
  height: 35px;
  background: linear-gradient(180deg, #666 0%, #444 100%);
  border-radius: 4px;
  position: relative;
}

.coffee-machine::before {
  content: '';
  position: absolute;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  width: 15px;
  height: 8px;
  background: #222;
  border-radius: 2px;
}

.water-dispenser {
  width: 20px;
  height: 40px;
  background: linear-gradient(180deg, #888 0%, #666 100%);
  border-radius: 3px;
}

/* Lounge items */
.lounge-items {
  display: flex;
  gap: 20px;
  padding: 30px;
  align-items: flex-end;
}

.sofa {
  width: 80px;
  height: 30px;
  background: linear-gradient(180deg, #5a4a3a 0%, #4a3a2a 100%);
  border-radius: 8px 8px 4px 4px;
  position: relative;
}

.sofa::before {
  content: '';
  position: absolute;
  top: -15px;
  left: 5px;
  right: 5px;
  height: 15px;
  background: #5a4a3a;
  border-radius: 4px 4px 0 0;
}

.plant {
  width: 20px;
  height: 30px;
  background: linear-gradient(180deg, #2d5a2d 0%, #1a3a1a 100%);
  border-radius: 50% 50% 0 0;
  position: relative;
}

.plant::before {
  content: '';
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 15px;
  height: 12px;
  background: #8b4513;
  border-radius: 2px;
}

/* Meeting room items */
.meeting-items {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  gap: 10px;
}

.table {
  width: 100px;
  height: 50px;
  background: #5a4a3a;
  border-radius: 8px;
  border: 2px solid #6a5a4a;
}

.chairs {
  display: flex;
  gap: 15px;
}

.chair {
  width: 15px;
  height: 20px;
  background: #444;
  border-radius: 4px 4px 2px 2px;
}
</style>
