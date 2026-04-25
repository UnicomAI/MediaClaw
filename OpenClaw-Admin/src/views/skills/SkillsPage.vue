<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NAlert,
  NCard,
  NGrid,
  NGridItem,
  NButton,
  NSpace,
  NSwitch,
  NTag,
  NText,
  NIcon,
  NInput,
  NSpin,
} from 'naive-ui'
import { RefreshOutline, SearchOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import { useSkillStore } from '@/stores/skill'
import type { Skill } from '@/api/types'

const skillStore = useSkillStore()
const { t } = useI18n()
const searchQuery = ref('')

onMounted(() => {
  skillStore.fetchSkills()
})

function isUserPlugin(skill: Skill): boolean {
  return (
    skill.source === 'workspace' ||
    skill.source === 'managed' ||
    skill.source === 'extra'
  )
}

function matchesQuery(skill: Skill): boolean {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return true

  return [
    skill.name,
    skill.description || '',
    skill.version || '',
  ].some((field) => field.toLowerCase().includes(query))
}

function sourceLabel(source: Skill['source']): string {
  switch (source) {
    case 'workspace': return t('pages.skills.sources.workspace')
    case 'managed': return t('pages.skills.sources.managed')
    case 'extra': return t('pages.skills.sources.extra')
    case 'bundled': return t('pages.skills.sources.bundled')
    default: return source
  }
}

function sourceType(source: Skill['source']): 'info' | 'success' | 'warning' {
  switch (source) {
    case 'workspace': return 'warning'
    case 'managed': return 'success'
    case 'extra': return 'info'
    case 'bundled': return 'info'
    default: return 'info'
  }
}

const userPlugins = computed(() => skillStore.skills.filter((skill) => isUserPlugin(skill)))
const visiblePlugins = computed(() => {
  const base = skillStore.skills.filter((skill) => matchesQuery(skill))
  if (skillStore.showBundled) return base
  return base.filter((skill) => skill.source !== 'bundled')
})
const bundledAvailablePlugins = computed(() =>
  skillStore.skills.filter(
    (skill) => skill.source === 'bundled' && skill.eligible !== false && !skill.disabled
  )
)
const availableTotalPlugins = computed(
  () => userPlugins.value.length + bundledAvailablePlugins.value.length
)

const bundledPlugins = computed(() =>
  visiblePlugins.value.filter(
    (skill) => skill.source === 'bundled' && skill.eligible !== false && !skill.disabled
  )
)
const userVisiblePlugins = computed(() =>
  visiblePlugins.value.filter((skill) => isUserPlugin(skill))
)

const pluginGroups = computed(() => {
  const groups = [
    {
      key: 'user',
      title: t('pages.skills.groups.user.title'),
      description: t('pages.skills.groups.user.description'),
      emptyText: t('pages.skills.groups.user.empty'),
      skills: userVisiblePlugins.value,
    },
  ]

  if (skillStore.showBundled) {
    groups.push({
      key: 'bundled',
      title: t('pages.skills.groups.bundled.title'),
      description: t('pages.skills.groups.bundled.description'),
      emptyText: t('pages.skills.groups.bundled.empty'),
      skills: bundledPlugins.value,
    })
  }

  return groups
})
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :title="t('pages.skills.title')" class="app-card">
      <template #header-extra>
        <NSpace :size="8" class="app-toolbar">
          <NSpace :size="8" align="center">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.showBundled') }}</NText>
            <NSwitch v-model:value="skillStore.showBundled" size="small" />
          </NSpace>
          <NSpace :size="8" align="center">
            <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.showBundledInChat') }}</NText>
            <NSwitch v-model:value="skillStore.showBundledInChat" size="small" />
          </NSpace>
          <NButton size="small" class="app-toolbar-btn app-toolbar-btn--refresh" @click="skillStore.fetchSkills()">
            <template #icon><NIcon :component="RefreshOutline" /></template>
            {{ t('common.refresh') }}
          </NButton>
        </NSpace>
      </template>

      <NSpace vertical :size="14">
        <NAlert type="info" :show-icon="true" style="border-radius: var(--radius);">
          {{ t('pages.skills.info') }}
        </NAlert>
        <NAlert v-if="skillStore.error" type="error" :show-icon="true" style="border-radius: var(--radius);">
          {{ t('pages.skills.loadFailed', { error: skillStore.error }) }}
        </NAlert>

        <NGrid cols="1 s:2 m:3" responsive="screen" :x-gap="12" :y-gap="12">
          <NGridItem>
            <NCard embedded :bordered="false" style="border-radius: var(--radius);">
              <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.stats.total') }}</NText>
              <div style="font-size: 22px; font-weight: 600; margin-top: 6px;">{{ availableTotalPlugins }}</div>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard embedded :bordered="false" style="border-radius: var(--radius);">
              <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.stats.bundledAvailable') }}</NText>
              <div style="font-size: 22px; font-weight: 600; margin-top: 6px;">{{ bundledAvailablePlugins.length }}</div>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard embedded :bordered="false" style="border-radius: var(--radius);">
              <NText depth="3" style="font-size: 12px;">{{ t('pages.skills.stats.user') }}</NText>
              <div style="font-size: 22px; font-weight: 600; margin-top: 6px;">{{ userPlugins.length }}</div>
            </NCard>
          </NGridItem>
        </NGrid>

        <NInput v-model:value="searchQuery" clearable :placeholder="t('pages.skills.searchPlaceholder')">
          <template #prefix><NIcon :component="SearchOutline" /></template>
        </NInput>
      </NSpace>

      <NSpin :show="skillStore.loading" style="margin-top: 16px;">
        <NSpace vertical :size="14">
          <NCard
            v-for="group in pluginGroups"
            :key="group.key"
            embedded
            :bordered="false"
            style="border-radius: var(--radius);"
          >
            <NSpace justify="space-between" align="center" style="margin-bottom: 10px;">
              <NSpace vertical :size="2">
                <NText strong>{{ group.title }}</NText>
                <NText depth="3" style="font-size: 12px;">{{ group.description }}</NText>
              </NSpace>
              <NTag size="small" round :bordered="false">{{ t('common.itemsCount', { count: group.skills.length }) }}</NTag>
            </NSpace>

            <NGrid v-if="group.skills.length > 0" cols="1 s:2 m:3" responsive="screen" :x-gap="12" :y-gap="12">
              <NGridItem v-for="skill in group.skills" :key="`${group.key}-${skill.name}`">
                <NCard hoverable style="border-radius: var(--radius);">
                  <NSpace vertical :size="10">
                    <NSpace justify="space-between" align="center">
                      <NText strong style="font-size: 15px;">{{ skill.name }}</NText>
                      <NSpace :size="6">
                        <NTag :type="sourceType(skill.source)" size="tiny" :bordered="false" round>
                          {{ sourceLabel(skill.source) }}
                        </NTag>
                        <NTag v-if="skill.hasUpdate" type="warning" size="tiny" :bordered="false" round>
                          {{ t('pages.skills.hasUpdate') }}
                        </NTag>
                      </NSpace>
                    </NSpace>

                    <NText depth="3" class="skill-desc">
                      {{ skill.description || t('common.noDescription') }}
                    </NText>

                    <NSpace justify="space-between" align="center">
                      <NText depth="3" style="font-size: 12px;">
                        {{ skill.version ? t('pages.skills.version', { version: skill.version }) : t('pages.skills.noVersion') }}
                      </NText>
                      <NSpace :size="10" align="center">
                        <NSpace :size="6" align="center">
                          <NText depth="3" style="font-size: 12px;">Chat</NText>
                          <NSwitch
                            size="small"
                            :value="skillStore.isSkillVisibleInChat(skill.name)"
                            @update:value="(val) => skillStore.setSkillVisibleInChat(skill.name, val)"
                          />
                        </NSpace>
                        <NTag
                          :type="skill.eligible === false ? 'warning' : 'success'"
                          size="small"
                          :bordered="false"
                          round
                        >
                          {{ skill.eligible === false ? t('pages.skills.eligibleRestricted') : t('pages.skills.eligibleOk') }}
                        </NTag>
                      </NSpace>
                    </NSpace>
                  </NSpace>
                </NCard>
              </NGridItem>
            </NGrid>

            <div
              v-else
              style="text-align: center; padding: 28px 12px; color: var(--text-secondary); font-size: 13px;"
            >
              {{ group.emptyText }}
            </div>
          </NCard>
        </NSpace>

        <div
          v-if="!skillStore.loading && visiblePlugins.length === 0"
          style="text-align: center; padding: 56px 0; color: var(--text-secondary);"
        >
          {{ t('pages.skills.noMatches') }}
        </div>
      </NSpin>
    </NCard>
  </NSpace>
</template>

<style scoped>
.skill-desc {
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  min-height: calc(1.5em * 3);
  word-break: break-word;
}
</style>
