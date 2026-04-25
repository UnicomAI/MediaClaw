import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

const AUTH_TOKEN_KEY = 'auth_token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(AUTH_TOKEN_KEY))
  const authEnabled = ref(true)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const configLoaded = ref(false)

  const isAuthenticated = computed(() => !!token.value)

  function setToken(newToken: string | null) {
    token.value = newToken
    if (newToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, newToken)
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  }

  async function checkAuthConfig(forceRefresh = false) {
    if (configLoaded.value && !forceRefresh) {
      return authEnabled.value
    }
    
    try {
      const response = await fetch('/api/auth/config', {
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const data = await response.json()
      authEnabled.value = !!data.enabled
      configLoaded.value = true
      return authEnabled.value
    } catch {
      authEnabled.value = false
      configLoaded.value = true
      return false
    }
  }

  async function checkAuth(): Promise<boolean> {
    if (!token.value) return false
    
    try {
      const response = await fetch('/api/auth/check', {
        headers: {
          'Authorization': `Bearer ${token.value}`,
        },
      })
      
      if (response.ok) {
        return true
      } else {
        setToken(null)
        return false
      }
    } catch {
      return false
    }
  }

  async function login(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = null
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })
      
      const data = await response.json()
      
      if (response.ok && data.ok) {
        if (data.token) {
          setToken(data.token)
        }
        loading.value = false
        return true
      } else {
        error.value = data.error || 'Login failed'
        loading.value = false
        return false
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Network error'
      loading.value = false
      return false
    }
  }

  async function logout() {
    try {
      if (token.value) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token.value}`,
          },
        })
      }
    } catch {
      // ignore
    }
    setToken(null)
  }

  function getToken(): string | null {
    return token.value
  }

  return {
    token,
    authEnabled,
    loading,
    error,
    isAuthenticated,
    checkAuthConfig,
    checkAuth,
    login,
    logout,
    getToken,
  }
})
