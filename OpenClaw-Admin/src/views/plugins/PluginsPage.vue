<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NIcon,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NText,
  useMessage,
} from 'naive-ui'
import {
  PlayOutline,
  RefreshOutline,
  SaveOutline,
} from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { usePluginsStore } from '@/stores/plugins'
import MediaClawConfig from '@/components/plugins/MediaClawConfig.vue'

const { t } = useI18n()
const message = useMessage()
const store = usePluginsStore()

const expandedPluginIds = ref<string[]>([])

onMounted(() => {
  store.refresh().then(() => {
    // 默认展开已启用的插件
    expandedPluginIds.value = store.plugins.filter(p => p.enabled).map(p => p.id)
  }).catch((err) => {
    message.error(t('pages.plugins.loadFailed', { error: err.message }))
  })
})

async function handleRefresh(): Promise<void> {
  try {
    await store.refresh()
    message.success(t('common.refreshSuccess'))
  } catch (err) {
    message.error(t('pages.plugins.loadFailed', { error: err instanceof Error ? err.message : String(err) }))
  }
}

async function handleSave(pluginId: string, apply: boolean = false): Promise<void> {
  try {
    const saved = await store.savePlugin(pluginId, apply)
    if (!saved) {
      message.info(t('pages.plugins.noChanges'))
      return
    }
    message.success(apply ? t('pages.plugins.savedAndApplied') : t('pages.plugins.saved'))
  } catch (err) {
    message.error(t('common.saveFailed') + ': ' + (err instanceof Error ? err.message : String(err)))
  }
}

function handleEnabledChange(pluginId: string, enabled: boolean): void {
  store.setPluginEnabled(pluginId, enabled)
}

function getPluginStatusType(plugin: { enabled: boolean; hasConfig: boolean }): 'success' | 'warning' | 'default' {
  if (plugin.enabled && plugin.hasConfig) return 'success'
  if (plugin.enabled && !plugin.hasConfig) return 'warning'
  return 'default'
}

function getPluginStatusLabel(plugin: { enabled: boolean; hasConfig: boolean }): string {
  if (plugin.enabled && plugin.hasConfig) return t('pages.plugins.status.configured')
  if (plugin.enabled && !plugin.hasConfig) return t('pages.plugins.status.noConfig')
  return t('pages.plugins.status.disabled')
}
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :title="t('pages.plugins.title')" class="plugins-root-card">
      <template #header-extra>
        <NSpace :size="10" class="toolbar-actions">
          <NButton size="small" class="toolbar-btn toolbar-btn--refresh" @click="handleRefresh">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('common.refresh') }}
          </NButton>
        </NSpace>
      </template>

      <NSpace vertical :size="14">
        <NAlert type="info" :bordered="false">
          {{ t('pages.plugins.info') }}
        </NAlert>

        <NAlert v-if="store.lastError" type="error" :bordered="false">
          {{ store.lastError }}
        </NAlert>

        <NSpin :show="store.loading">
          <NCollapse v-model:expanded-names="expandedPluginIds">
            <NCollapseItem
              v-for="plugin in store.plugins"
              :key="plugin.id"
              :name="plugin.id"
            >
              <template #header>
                <NSpace align="center" :size="8" class="plugin-header-row">
                  <NText strong>{{ plugin.name }}</NText>
                  <NText depth="3" class="plugin-id-text">{{ plugin.id }}</NText>
                  <NTag
                    :type="getPluginStatusType(plugin)"
                    size="small"
                    :bordered="false"
                  >
                    {{ getPluginStatusLabel(plugin) }}
                  </NTag>
                </NSpace>
              </template>

              <NSpace vertical :size="12">
                <div class="plugin-desc-panel">
                  <span>{{ plugin.description }}</span>
                </div>

                <!-- 基础配置 -->
                <NCard size="small" :title="t('pages.plugins.basicConfig')" embedded>
                  <NForm label-placement="left" label-width="80">
                    <NFormItem :label="t('pages.plugins.enabled')">
                      <NSwitch
                        :value="store.getPluginEnabled(plugin.id)"
                        @update:value="(v: boolean) => handleEnabledChange(plugin.id, v)"
                      />
                    </NFormItem>
                  </NForm>
                </NCard>

                <!-- 插件特定配置 -->
                <template v-if="plugin.configType === 'mediaclaw'">
                  <MediaClawConfig :plugin-id="plugin.id" />
                </template>

                <!-- 通用配置（非 MediaClaw） -->
                <template v-else-if="plugin.hasConfig">
                  <NCard size="small" :title="t('pages.plugins.advancedConfig')" embedded>
                    <NAlert type="info" :bordered="false">
                      {{ t('pages.plugins.genericConfigHint') }}
                    </NAlert>
                  </NCard>
                </template>

                <!-- 操作按钮 -->
                <NSpace justify="end" :size="8">
                  <NButton
                    size="small"
                    :loading="store.saving"
                    :disabled="!store.hasChanges(plugin.id)"
                    @click="handleSave(plugin.id, false)"
                  >
                    <template #icon><NIcon :component="SaveOutline" /></template>
                    {{ t('pages.plugins.save') }}
                  </NButton>
                  <NButton
                    size="small"
                    type="primary"
                    :loading="store.saving || store.applying"
                    :disabled="!store.hasChanges(plugin.id)"
                    @click="handleSave(plugin.id, true)"
                  >
                    <template #icon><NIcon :component="PlayOutline" /></template>
                    {{ t('pages.plugins.saveAndApply') }}
                  </NButton>
                </NSpace>
              </NSpace>
            </NCollapseItem>
          </NCollapse>
        </NSpin>
      </NSpace>
    </NCard>
  </NSpace>
</template>

<style scoped>
.plugins-root-card {
  --card-border: var(--border-color);
  --card-bg: var(--bg-card);
  --soft-bg: var(--bg-secondary);
  --text: var(--text-primary);
  --text-muted: var(--text-secondary);
  border-radius: 18px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  box-shadow: var(--shadow-sm);
}

.toolbar-actions {
  align-items: center;
}

:deep(.plugins-root-card > .n-card-header) {
  padding-bottom: 10px;
}

:deep(.plugins-root-card > .n-card__content) {
  padding-top: 12px;
}

.toolbar-btn {
  min-width: 100px;
}

.plugin-header-row {
  flex-wrap: wrap;
  row-gap: 6px;
}

.plugin-id-text {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.plugin-desc-panel {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--soft-bg);
  color: var(--text);
  padding: 10px 12px;
}

:deep(.n-collapse-item) {
  border: 1px solid var(--card-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--card-bg) !important;
  transition: background-color 160ms ease;
  margin: 0 !important;
}

:deep(.n-collapse) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 0;
}

:deep(.n-collapse-item:not(:first-child)) {
  border-top: none !important;
}

:deep(.n-collapse-item .n-collapse-item__header) {
  padding: 10px 12px;
}

:deep(.n-collapse-item:first-child > .n-collapse-item__header) {
  padding-top: 10px !important;
}

:deep(.n-collapse-item .n-collapse-item__header-main) {
  color: var(--text);
}

:deep(.n-collapse-item .n-collapse-item__content-wrapper) {
  border-top: 1px solid var(--card-border);
  background: var(--card-bg);
}

:deep(.n-collapse-item .n-collapse-item__content-inner) {
  padding: 10px 12px 12px;
}

:deep(.n-collapse-item__content-wrapper .n-collapse-item__content-inner) {
  padding-top: 10px !important;
}

:deep(.n-card.n-card--embedded) {
  background: var(--soft-bg);
  color: var(--text);
  border-color: var(--card-border);
}

:deep(.n-collapse-item:hover) {
  background: rgba(32, 128, 240, 0.06) !important;
}

:deep(.n-form-item) {
  margin-bottom: 10px;
}

:deep(.n-form-item:last-child) {
  margin-bottom: 0;
}
</style>
