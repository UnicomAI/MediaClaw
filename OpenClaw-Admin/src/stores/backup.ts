import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import type {
  BackupItem,
  BackupTask,
  BackupTaskStatus,
  BackupTaskProgress,
  BackupCreateParams,
  BackupRestoreParams,
  BackupListResult,
} from '@/api/types/backup'

export const useBackupStore = defineStore('backup', () => {
  const backupList = ref<BackupItem[]>([])
  const tasks = ref<Map<string, BackupTask>>(new Map())
  const loading = ref(false)
  const initialized = ref(false)

  const activeTasks = computed(() => {
    return Array.from(tasks.value.values()).filter(
      (t) => t.status === 'pending' || t.status === 'running'
    )
  })

  const hasActiveTask = computed(() => activeTasks.value.length > 0)

  const createTasks = computed(() =>
    Array.from(tasks.value.values()).filter((t) => t.type === 'create')
  )

  const restoreTasks = computed(() =>
    Array.from(tasks.value.values()).filter((t) => t.type === 'restore')
  )

  const uploadTasks = computed(() =>
    Array.from(tasks.value.values()).filter((t) => t.type === 'upload')
  )

  function generateTaskId(): string {
    return `backup-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function createTask(
    type: BackupTask['type'],
    filename?: string
  ): BackupTask {
    const task: BackupTask = {
      id: generateTaskId(),
      type,
      status: 'pending',
      progress: 0,
      message: '',
      filename,
      startedAt: Date.now(),
    }
    tasks.value.set(task.id, task)
    return task
  }

  function updateTask(
    taskId: string,
    updates: Partial<BackupTask>
  ): void {
    const task = tasks.value.get(taskId)
    if (task) {
      Object.assign(task, updates)
      tasks.value.set(taskId, { ...task })
    }
  }

  function updateTaskProgress(progress: BackupTaskProgress): void {
    const task = tasks.value.get(progress.taskId)
    if (task) {
      task.status = progress.status
      task.progress = progress.progress
      task.message = progress.message
      tasks.value.set(progress.taskId, { ...task })
    }
  }

  function completeTask(
    taskId: string,
    result?: BackupTask['result'],
    error?: string
  ): void {
    const task = tasks.value.get(taskId)
    if (task) {
      task.status = error ? 'failed' : 'completed'
      task.progress = 100
      task.completedAt = Date.now()
      task.result = result
      task.error = error
      tasks.value.set(taskId, { ...task })
    }
  }

  function removeTask(taskId: string): void {
    tasks.value.delete(taskId)
  }

  async function clearCompletedTasks(): Promise<void> {
    for (const [id, task] of tasks.value.entries()) {
      if (task.status === 'completed' || task.status === 'failed') {
        tasks.value.delete(id)
      }
    }

    try {
      const authStore = useAuthStore()
      const token = authStore.token || localStorage.getItem('auth_token') || ''

      await fetch('/api/backup/tasks/completed', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } catch (error) {
      console.error('[BackupStore] Failed to clear completed tasks from server:', error)
    }
  }

  function markRunningTasksAsFailed(error: string): void {
    for (const [id, task] of tasks.value.entries()) {
      if (task.status === 'running' || task.status === 'pending') {
        task.status = 'failed'
        task.error = error
        task.message = 'Task interrupted'
        tasks.value.set(id, { ...task })
      }
    }
  }

  async function fetchTasks(): Promise<void> {
    try {
      const authStore = useAuthStore()
      const token = authStore.token || localStorage.getItem('auth_token') || ''

      const response = await fetch('/api/backup/tasks', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      if (data.ok && data.tasks) {
        for (const task of data.tasks) {
          if (!tasks.value.has(task.id) || tasks.value.get(task.id)?.status === 'pending' || tasks.value.get(task.id)?.status === 'running') {
            tasks.value.set(task.id, {
              id: task.id,
              type: task.type,
              status: task.status,
              progress: task.progress,
              message: task.message,
              filename: task.filename,
              error: task.error,
              startedAt: task.startedAt,
              completedAt: task.completedAt,
              result: task.result,
            })
          }
        }
      }
    } catch (error) {
      console.error('[BackupStore] Failed to fetch tasks:', error)
    }
  }

  async function fetchBackupList(): Promise<void> {
    loading.value = true
    try {
      const authStore = useAuthStore()
      const token = authStore.token || localStorage.getItem('auth_token') || ''

      const response = await fetch('/api/backup/list', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data: BackupListResult = await response.json()
      if (data.backups) {
        backupList.value = data.backups
      }
    } catch (error) {
      console.error('[BackupStore] Failed to fetch backup list:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function createBackup(params?: BackupCreateParams): Promise<BackupTask> {
    const tempTask = createTask('create')

    try {
      updateTask(tempTask.id, { status: 'running', message: 'Starting backup...' })

      const authStore = useAuthStore()
      const token = authStore.token || localStorage.getItem('auth_token') || ''

      const response = await fetch('/api/backup/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params || {}),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}`)
      }

      const serverTaskId = data.taskId
      if (serverTaskId && serverTaskId !== tempTask.id) {
        tasks.value.delete(tempTask.id)
        const newTask: BackupTask = {
          id: serverTaskId,
          type: 'create',
          status: 'running',
          progress: 0,
          message: 'Starting backup...',
          startedAt: Date.now(),
        }
        tasks.value.set(serverTaskId, newTask)
        return newTask
      }

      return tasks.value.get(tempTask.id)!
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      completeTask(tempTask.id, undefined, errorMsg)
      throw error
    }
  }

  async function restoreBackup(params: BackupRestoreParams): Promise<BackupTask> {
    const tempTask = createTask('restore', params.filename)

    try {
      updateTask(tempTask.id, { status: 'running', message: 'Starting restore...' })

      const authStore = useAuthStore()
      const token = authStore.token || localStorage.getItem('auth_token') || ''

      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}`)
      }

      const serverTaskId = data.taskId
      if (serverTaskId && serverTaskId !== tempTask.id) {
        tasks.value.delete(tempTask.id)
        const newTask: BackupTask = {
          id: serverTaskId,
          type: 'restore',
          status: 'running',
          progress: 0,
          message: 'Starting restore...',
          filename: params.filename,
          startedAt: Date.now(),
        }
        tasks.value.set(serverTaskId, newTask)
        return newTask
      }

      return tasks.value.get(tempTask.id)!
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      completeTask(tempTask.id, undefined, errorMsg)
      throw error
    }
  }

  async function deleteBackup(filename: string): Promise<void> {
    const authStore = useAuthStore()
    const token = authStore.token || localStorage.getItem('auth_token') || ''

    const response = await fetch(
      `/api/backup/delete?filename=${encodeURIComponent(filename)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    const data = await response.json()

    if (!response.ok || !data.ok) {
      throw new Error(data.error?.message || `HTTP ${response.status}`)
    }

    await fetchBackupList()
  }

  async function uploadBackup(file: File): Promise<BackupTask> {
    const tempTask = createTask('upload', file.name)

    try {
      updateTask(tempTask.id, { status: 'running', message: 'Uploading backup...' })

      const authStore = useAuthStore()
      const token = authStore.token || localStorage.getItem('auth_token') || ''

      const formData = new FormData()
      formData.append('backup', file)

      const response = await fetch('/api/backup/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}`)
      }

      const serverTaskId = data.taskId
      if (serverTaskId && serverTaskId !== tempTask.id) {
        tasks.value.delete(tempTask.id)
        const newTask: BackupTask = {
          id: serverTaskId,
          type: 'upload',
          status: 'running',
          progress: 0,
          message: 'Uploading backup...',
          filename: file.name,
          startedAt: Date.now(),
        }
        tasks.value.set(serverTaskId, newTask)
        return newTask
      }

      return tasks.value.get(tempTask.id)!
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      completeTask(tempTask.id, undefined, errorMsg)
      throw error
    }
  }

  async function downloadBackup(filename: string): Promise<void> {
    const authStore = useAuthStore()
    const token = authStore.token || localStorage.getItem('auth_token') || ''

    const response = await fetch(
      `/api/backup/download?filename=${encodeURIComponent(filename)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  async function initialize(): Promise<void> {
    if (initialized.value) return

    try {
      await fetchBackupList()
      initialized.value = true
    } catch (error) {
      console.error('[BackupStore] Initialize failed:', error)
    }
  }

  return {
    backupList,
    tasks,
    loading,
    initialized,
    activeTasks,
    hasActiveTask,
    createTasks,
    restoreTasks,
    uploadTasks,
    initialize,
    fetchBackupList,
    fetchTasks,
    createBackup,
    restoreBackup,
    deleteBackup,
    uploadBackup,
    downloadBackup,
    createTask,
    updateTask,
    updateTaskProgress,
    completeTask,
    removeTask,
    clearCompletedTasks,
    markRunningTasksAsFailed,
  }
})
