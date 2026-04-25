<script setup lang="ts">
import { computed } from 'vue'
import { NIcon, NBadge } from 'naive-ui'
import {
  SettingsOutline,
  ServerOutline,
  ChatbubblesOutline,
  ExtensionPuzzleOutline,
  LinkOutline,
  BuildOutline,
  TerminalOutline,
  CloudOutline,
  LayersOutline,
} from '@vicons/ionicons5'

export interface ConfigCategory {
  id: string
  name: string
  icon?: string
  description?: string
  fieldCount?: number
  modifiedCount?: number
}

const props = defineProps<{
  categories: ConfigCategory[]
  activeCategory: string | null
}>()

const emit = defineEmits<{
  (e: 'update:activeCategory', value: string): void
}>()

const iconMap: Record<string, unknown> = {
  settings: SettingsOutline,
  server: ServerOutline,
  channels: ChatbubblesOutline,
  plugins: ExtensionPuzzleOutline,
  bindings: LinkOutline,
  tools: BuildOutline,
  session: TerminalOutline,
  gateway: CloudOutline,
  models: LayersOutline,
}

function getIcon(iconName?: string) {
  if (!iconName) return SettingsOutline
  return iconMap[iconName] || SettingsOutline
}

function handleCategoryClick(categoryId: string) {
  emit('update:activeCategory', categoryId)
}

function isActive(categoryId: string) {
  return props.activeCategory === categoryId
}

function hasModifications(category: ConfigCategory) {
  return (category.modifiedCount || 0) > 0
}
</script>

<template>
  <div class="config-category-nav">
    <div class="config-category-nav-header">
      <h3 class="config-category-nav-title">配置分类</h3>
    </div>

    <div class="config-category-nav-list">
      <button
        v-for="category in categories"
        :key="category.id"
        class="config-category-nav-item"
        :class="{ 'config-category-nav-item--active': isActive(category.id) }"
        @click="handleCategoryClick(category.id)"
      >
        <div class="config-category-nav-item-icon">
          <NIcon :size="18" :component="getIcon(category.icon) as any" />
        </div>
        <div class="config-category-nav-item-content">
          <span class="config-category-nav-item-name">{{ category.name }}</span>
          <span v-if="category.description" class="config-category-nav-item-desc">
            {{ category.description }}
          </span>
        </div>
        <NBadge
          v-if="hasModifications(category)"
          :value="category.modifiedCount"
          :max="99"
          type="warning"
          class="config-category-nav-item-badge"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.config-category-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
}

.config-category-nav-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.config-category-nav-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.config-category-nav-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.config-category-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.config-category-nav-item:hover {
  background: var(--bg-secondary);
}

.config-category-nav-item--active {
  background: var(--bg-secondary);
}

.config-category-nav-item--active .config-category-nav-item-icon {
  color: var(--active-color, #18a058);
}

.config-category-nav-item--active .config-category-nav-item-name {
  color: var(--text-primary);
  font-weight: 500;
}

.config-category-nav-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.config-category-nav-item--active .config-category-nav-item-icon {
  background: rgba(24, 160, 88, 0.1);
}

.config-category-nav-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.config-category-nav-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.config-category-nav-item-desc {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.config-category-nav-item-badge {
  flex-shrink: 0;
}

[data-theme='dark'] .config-category-nav-item--active .config-category-nav-item-icon {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

[data-theme='dark'] .config-category-nav-item:hover {
  background: var(--bg-secondary);
}

[data-theme='dark'] .config-category-nav-item--active {
  background: var(--bg-secondary);
}
</style>
