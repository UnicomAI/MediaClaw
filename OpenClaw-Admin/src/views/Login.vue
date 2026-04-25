<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { NButton, NText, NAlert, NSpin, NInput, NFormItem, NForm } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useWebSocketStore } from '@/stores/websocket'
import { ConnectionState } from '@/api/types'
import AnimatedCharacters from '@/components/common/AnimatedCharacters.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const websocketStore = useWebSocketStore()
const { t } = useI18n()

const loading = ref(true)
const checking = ref(true)
const error = ref('')
const username = ref('')
const password = ref('')
const isTyping = ref(false)
const showPassword = ref(false)

const connectionState = computed(() => websocketStore.state)
const isConnected = computed(() => connectionState.value === ConnectionState.CONNECTED)
const isConnecting = computed(() => 
  connectionState.value === ConnectionState.CONNECTING || 
  connectionState.value === ConnectionState.RECONNECTING
)

onMounted(async () => {
  const authEnabled = await authStore.checkAuthConfig()
  
  if (!authEnabled) {
    websocketStore.connect()
    
    const checkConnection = () => {
      if (isConnected.value) {
        loading.value = false
        const redirect = (route.query.redirect as string) || '/'
        router.push(redirect)
      } else if (websocketStore.lastError) {
        loading.value = false
        error.value = websocketStore.lastError
      }
    }

    const unsubscribe = websocketStore.subscribe('stateChange', () => {
      checkConnection()
    })

    const timer = setTimeout(() => {
      if (loading.value) {
        loading.value = false
        if (!isConnected.value) {
          error.value = t('pages.login.connectTimeout')
        }
      }
      unsubscribe()
    }, 10000)

    checkConnection()
  } else {
    checking.value = false
    loading.value = false
    
    if (authStore.isAuthenticated) {
      const valid = await authStore.checkAuth()
      if (valid) {
        const redirect = (route.query.redirect as string) || '/'
        router.push(redirect)
      }
    }
  }
})

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = t('pages.login.credentialsRequired')
    return
  }
  
  loading.value = true
  error.value = ''
  
  const success = await authStore.login(username.value, password.value)
  
  if (success) {
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } else {
    const serverError = authStore.error
    if (serverError === 'Invalid credentials') {
      error.value = t('pages.login.invalidCredentials')
    } else {
      error.value = serverError || t('pages.login.invalidCredentials')
    }
    loading.value = false
  }
}

function handleRetry() {
  error.value = ''
  loading.value = true
  websocketStore.disconnect()
  websocketStore.connect()
  
  const timer = setTimeout(() => {
    if (loading.value) {
      loading.value = false
      if (!isConnected.value) {
        error.value = t('pages.login.connectTimeout')
      }
    }
  }, 10000)
}

function handleFocus() {
  isTyping.value = true
}

function handleBlur() {
  isTyping.value = false
}
</script>

<template>
  <div class="login-container">
    <div class="login-left">
      <div class="login-brand">
        <span class="login-logo">🦞</span>
        <span class="login-brand-text">Claw Admin</span>
      </div>

      <div class="login-characters">
        <AnimatedCharacters 
          :is-typing="isTyping"
          :show-password="showPassword"
          :password-length="password.length"
        />
      </div>

      <div class="login-decoration login-decoration-1"></div>
      <div class="login-decoration login-decoration-2"></div>
      <div class="login-decoration login-decoration-3"></div>
    </div>
    
    <div class="login-right">
      <div class="login-form-wrapper">
        <div class="login-mobile-brand">
          <span class="login-logo-small">🦞</span>
          <span>Claw Admin</span>
        </div>

        <div v-if="loading && !checking" class="login-loading">
          <NSpin size="medium" />
          <div class="login-loading-text">
            <NText depth="3">{{ t('pages.login.loggingIn') }}</NText>
          </div>
        </div>

        <template v-else-if="authStore.authEnabled || checking">
          <div class="login-form-header">
            <h2 class="login-form-title">{{ t('pages.login.login') }}</h2>
            <p class="login-form-desc">{{ t('pages.login.subtitle') }}</p>
          </div>

          <NAlert v-if="error" type="error" :bordered="false" style="margin-bottom: 20px;">
            {{ error }}
          </NAlert>

          <NForm @submit.prevent="handleLogin">
            <div class="form-item">
              <label class="form-label">{{ t('pages.login.username') }}</label>
              <NInput
                v-model:value="username"
                :placeholder="t('pages.login.usernamePlaceholder')"
                size="large"
                class="login-input"
                @focus="handleFocus"
                @blur="handleBlur"
                @keydown.enter="handleLogin"
              />
            </div>
            
            <div class="form-item">
              <label class="form-label">{{ t('pages.login.password') }}</label>
              <div class="password-wrapper">
                <NInput
                  v-model:value="password"
                  :type="showPassword ? 'text' : 'password'"
                  :placeholder="t('pages.login.passwordPlaceholder')"
                  size="large"
                  class="login-input"
                  @focus="handleFocus"
                  @blur="handleBlur"
                  @keydown.enter="handleLogin"
                />
                <button
                  type="button"
                  class="password-toggle"
                  @click="showPassword = !showPassword"
                >
                  <svg v-if="showPassword" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </div>
            </div>

            <NButton
              type="primary"
              block
              size="large"
              class="login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              {{ t('pages.login.login') }}
            </NButton>
          </NForm>
        </template>

        <template v-else>
          <div class="login-form-header">
            <h2 class="login-form-title">{{ t('pages.login.login') }}</h2>
            <p class="login-form-desc">{{ t('pages.login.subtitle') }}</p>
          </div>

          <div v-if="loading || isConnecting" class="login-loading">
            <NSpin size="medium" />
            <div class="login-loading-text">
              <NText depth="3">{{ t('pages.login.connecting') }}</NText>
            </div>
          </div>

          <NAlert v-if="error" type="error" :bordered="false" style="margin-bottom: 20px;">
            {{ error }}
          </NAlert>

          <NAlert v-if="!loading && !error && !isConnected" type="warning" :bordered="false" style="margin-bottom: 20px;">
            {{ t('pages.login.gatewayDisconnected') }}
          </NAlert>

          <NButton
            v-if="!loading && !isConnected"
            type="primary"
            block
            size="large"
            class="login-btn"
            @click="handleRetry"
          >
            {{ t('pages.login.retry') }}
          </NButton>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  width: 100%;
}

.login-left {
  flex: 1;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 48px;
  position: relative;
  overflow: hidden;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.login-logo {
  font-size: 32px;
  display: inline-block;
  background: rgba(255,255,255,0.1);
  backdrop-filter: blur(8px);
  padding: 4px;
  border-radius: 12px;
}

.login-brand-text {
  color: white;
}

.login-characters {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 500px;
}

.login-decoration {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.login-decoration-1 {
  inset: 0;
  background: radial-gradient(circle at center, rgba(255,255,255,0.05) 0%, transparent 70%);
}

.login-decoration-2 {
  top: 25%;
  right: 25%;
  width: 256px;
  height: 256px;
  background: rgba(255,255,255,0.05);
  filter: blur(64px);
}

.login-decoration-3 {
  bottom: 25%;
  left: 25%;
  width: 384px;
  height: 384px;
  background: rgba(255,255,255,0.03);
  filter: blur(64px);
}

.login-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: var(--bg-primary);
}

.login-form-wrapper {
  width: 100%;
  max-width: 420px;
}

.login-mobile-brand {
  display: none;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 48px;
  color: var(--text-primary);
}

.login-logo-small {
  font-size: 28px;
}

.login-form-header {
  margin-bottom: 32px;
  text-align: center;
}

.login-form-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}

.login-form-desc {
  color: var(--text-secondary);
  font-size: 15px;
}

.login-loading {
  text-align: center;
  padding: 40px 0;
}

.login-loading-text {
  margin-top: 16px;
}

.form-item {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.login-input {
  border-radius: 8px;
}

.password-wrapper {
  position: relative;
}

.password-toggle {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.password-toggle:hover {
  color: var(--text-primary);
}

.login-btn {
  border-radius: 8px;
  height: 48px;
  font-weight: 600;
  font-size: 15px;
  margin-top: 8px;
}

@media (max-width: 900px) {
  .login-left {
    display: none;
  }
  
  .login-right {
    padding: 24px;
  }

  .login-mobile-brand {
    display: flex;
  }
}
</style>
