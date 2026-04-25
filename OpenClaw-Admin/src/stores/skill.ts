import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useWebSocketStore } from './websocket'
import type { Skill } from '@/api/types'

const STORAGE_KEY_SHOW_BUNDLED = 'openclaw_skill_show_bundled'
const STORAGE_KEY_SHOW_BUNDLED_IN_CHAT = 'openclaw_skill_show_bundled_in_chat'
const STORAGE_KEY_CHAT_VISIBILITY = 'openclaw_skill_chat_visibility'
const STORAGE_KEY_CHAT_HIDDEN_SKILLS = 'openclaw_skill_chat_hidden' // legacy

function readStoredBool(key: string, defaultValue: boolean): boolean {
  const raw = localStorage.getItem(key)
  if (raw === null) return defaultValue
  return raw === 'true'
}

function readStoredBooleanRecord(key: string): Record<string, boolean> {
  const raw = localStorage.getItem(key)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const result: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const name = k.trim()
      if (!name) continue
      if (typeof v === 'boolean') {
        result[name] = v
      }
    }
    return result
  } catch {
    return {}
  }
}

function readStoredStringArray(key: string): string[] {
  const raw = localStorage.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function uniqueSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  )
}

function normalizeBooleanRecord(input: Record<string, boolean>): Record<string, boolean> {
  const entries = Object.entries(input)
    .map(([k, v]) => [k.trim(), v] as const)
    .filter(([k]) => !!k)
    .sort(([a], [b]) => a.localeCompare(b))

  const next: Record<string, boolean> = {}
  for (const [k, v] of entries) {
    next[k] = v
  }
  return next
}

export const useSkillStore = defineStore('skill', () => {
  const skills = ref<Skill[]>([])
  const loading = ref(false)
  const installing = ref<string | null>(null)
  const error = ref<string | null>(null)

  // UI 偏好：是否展示内置技能，以及内置技能是否出现在 Chat 的 /skill 提示中
  const showBundled = ref(readStoredBool(STORAGE_KEY_SHOW_BUNDLED, true))
  const showBundledInChat = ref(readStoredBool(STORAGE_KEY_SHOW_BUNDLED_IN_CHAT, false))
  const legacyHidden = uniqueSortedStrings(readStoredStringArray(STORAGE_KEY_CHAT_HIDDEN_SKILLS))
  const storedOverrides = readStoredBooleanRecord(STORAGE_KEY_CHAT_VISIBILITY)
  const mergedOverrides = normalizeBooleanRecord({
    ...Object.fromEntries(legacyHidden.map((name) => [name, false] as const)),
    ...storedOverrides,
  })

  if (legacyHidden.length > 0) {
    // One-time migration from legacy hidden list to the overrides map.
    localStorage.setItem(STORAGE_KEY_CHAT_VISIBILITY, JSON.stringify(mergedOverrides))
    localStorage.removeItem(STORAGE_KEY_CHAT_HIDDEN_SKILLS)
  }
  const chatVisibilityOverrides = ref<Record<string, boolean>>(
    mergedOverrides
  )

  watch(showBundled, (val) => {
    localStorage.setItem(STORAGE_KEY_SHOW_BUNDLED, String(val))
  })
  watch(showBundledInChat, (val) => {
    localStorage.setItem(STORAGE_KEY_SHOW_BUNDLED_IN_CHAT, String(val))
  })
  watch(chatVisibilityOverrides, (val) => {
    localStorage.setItem(STORAGE_KEY_CHAT_VISIBILITY, JSON.stringify(normalizeBooleanRecord(val)))
  }, { deep: true })

  const wsStore = useWebSocketStore()

  function resolveChatDefaultVisibleByName(name: string): boolean {
    const skill = skills.value.find((entry) => entry.name === name)
    if (!skill) return true
    if (skill.source === 'bundled') return showBundledInChat.value
    return true
  }

  function isSkillVisibleInChat(name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed) return false

    const override = chatVisibilityOverrides.value[trimmed]
    if (typeof override === 'boolean') {
      return override
    }

    return resolveChatDefaultVisibleByName(trimmed)
  }

  function setSkillVisibleInChat(name: string, visible: boolean) {
    const trimmed = name.trim()
    if (!trimmed) return

    const next = { ...chatVisibilityOverrides.value }
    const defaultVisible = resolveChatDefaultVisibleByName(trimmed)
    if (visible === defaultVisible) {
      delete next[trimmed]
    } else {
      next[trimmed] = visible
    }
    chatVisibilityOverrides.value = next
  }

  async function fetchSkills() {
    loading.value = true
    error.value = null
    try {
      skills.value = await wsStore.rpc.listSkills()
    } catch (err) {
      skills.value = []
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      console.error('[SkillStore] fetchSkills failed:', err)
    } finally {
      loading.value = false
    }
  }

  async function installSkill(name: string) {
    installing.value = name
    error.value = null
    try {
      await wsStore.rpc.installSkill(name)
      await fetchSkills()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      throw err
    } finally {
      installing.value = null
    }
  }

  async function updateSkills() {
    loading.value = true
    error.value = null
    try {
      await wsStore.rpc.updateSkills()
      await fetchSkills()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    skills,
    loading,
    installing,
    error,
    showBundled,
    showBundledInChat,
    chatVisibilityOverrides,
    isSkillVisibleInChat,
    setSkillVisibleInChat,
    fetchSkills,
    installSkill,
    updateSkills,
  }
})
