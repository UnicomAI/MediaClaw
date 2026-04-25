<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent } from 'naive-ui'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useWebSocketStore } from '@/stores/websocket'
import { useHermesConnectionStore } from '@/stores/hermes/connection'

const collapsed = ref(false)
const wsStore = useWebSocketStore()
const connStore = useHermesConnectionStore()
const route = useRoute()
const router = useRouter()

const isOpenClaw = computed(() => connStore.currentGateway === 'openclaw')

onMounted(() => {
  if (isOpenClaw.value) {
    wsStore.connect()
  } else {
    // Hermes 模式：自动连接 Hermes
    connStore.connect()
  }

  // 如果当前页面不属于当前网关，自动跳转
  const currentGateway = isOpenClaw.value ? 'openclaw' : 'hermes'
  const routeGateway = route.meta?.gateway as string | undefined
  if (routeGateway && routeGateway !== currentGateway) {
    router.replace(isOpenClaw.value ? '/' : '/hermes/chat')
  }
})

watch(isOpenClaw, (val) => {
  if (val) {
    wsStore.connect()
    connStore.disconnect()
  } else {
    wsStore.disconnect()
    // Hermes 模式：自动连接 Hermes
    connStore.connect()
  }

  // 网关切换时，如果当前页面不属于新网关，自动跳转到首页
  const currentGateway = val ? 'openclaw' : 'hermes'
  const routeGateway = route.meta?.gateway as string | undefined
  if (routeGateway && routeGateway !== currentGateway) {
    router.push(val ? '/' : '/hermes/chat')
  }
})

onUnmounted(() => {
  wsStore.disconnect()
})
</script>

<template>
  <NLayout has-sider position="absolute" class="app-layout-root">
    <NLayoutSider
      class="app-layout-sider"
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :collapsed="collapsed"
      show-trigger
      :native-scrollbar="false"
      style="height: 100vh;"
      @collapse="collapsed = true"
      @expand="collapsed = false"
    >
      <AppSidebar :collapsed="collapsed" />
    </NLayoutSider>

    <NLayout class="app-layout-main">
      <NLayoutHeader bordered class="app-layout-header">
        <AppHeader />
      </NLayoutHeader>

      <NLayoutContent
        class="app-layout-content"
        :native-scrollbar="false"
        content-style="padding: 24px;"
      >
        <div class="page-container">
          <RouterView v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </RouterView>
        </div>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<style scoped>
.app-layout-root {
  inset: 0;
  height: 100vh;
  overflow: hidden;
}

.app-layout-main {
  height: 100vh;
  overflow: hidden;
}

.app-layout-header {
  height: var(--header-height);
  padding: 0 24px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 12;
  background: var(--bg-card);
}

.app-layout-content {
  height: calc(100vh - var(--header-height));
}

:deep(.app-layout-content .n-layout-scroll-container) {
  height: 100%;
}
</style>
