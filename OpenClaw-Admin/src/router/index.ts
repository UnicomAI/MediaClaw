import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  let authEnabled = false
  try {
    authEnabled = await authStore.checkAuthConfig()
  } catch (error) {
    console.error('[Router] checkAuthConfig failed:', error)
    // 认证配置检查失败时，假设认证已禁用，允许访问
    authEnabled = false
  }

  if (!authEnabled) {
    if (to.name === 'Login') {
      next({ name: 'Dashboard' })
      return
    }
    next()
    return
  }

  if (to.meta.public) {
    if (to.name === 'Login' && authStore.isAuthenticated) {
      try {
        const valid = await authStore.checkAuth()
        if (valid) {
          const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/'
          next(redirect)
          return
        }
      } catch (error) {
        console.error('[Router] checkAuth failed:', error)
      }
    }
    next()
    return
  }

  if (!authStore.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  try {
    const valid = await authStore.checkAuth()
    if (!valid) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }
  } catch (error) {
    console.error('[Router] checkAuth failed:', error)
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  next()
})

export default router
