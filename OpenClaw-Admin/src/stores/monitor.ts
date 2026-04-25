import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { AgentEvent } from '@/api/types'

const MAX_EVENTS = 1000

export const useMonitorStore = defineStore('monitor', () => {
  const events = ref<AgentEvent[]>([])
  const paused = ref(false)

  const eventCount = computed(() => events.value.length)

  function addEvent(event: AgentEvent) {
    if (paused.value) return
    events.value.unshift(event)
    if (events.value.length > MAX_EVENTS) {
      events.value.length = MAX_EVENTS
    }
  }

  function clearEvents() {
    events.value = []
  }

  function filterByType(type: string): AgentEvent[] {
    return events.value.filter((e) => e.event === type)
  }

  return {
    events,
    paused,
    eventCount,
    addEvent,
    clearEvents,
    filterByType,
  }
})
