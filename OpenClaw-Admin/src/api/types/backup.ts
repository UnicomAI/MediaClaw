export interface BackupItem {
  filename: string
  createdAt: string
  size: number
  date: string
}

export type BackupTaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface BackupTask {
  id: string
  type: 'create' | 'restore' | 'upload'
  status: BackupTaskStatus
  progress: number
  message: string
  filename?: string
  error?: string
  startedAt: number
  completedAt?: number
  result?: BackupTaskResult
}

export interface BackupTaskResult {
  filename?: string
  size?: number
  database?: boolean
  config?: boolean
  sessions?: number
  errors?: string[]
}

export interface BackupCreateParams {
  includeDatabase?: boolean
  includeConfig?: boolean
  includeSessions?: boolean
  includeEnv?: boolean
}

export interface BackupRestoreParams {
  filename: string
}

export interface BackupListResult {
  backups: BackupItem[]
  total: number
}

export interface BackupTaskProgress {
  taskId: string
  status: BackupTaskStatus
  progress: number
  message: string
  stage?: string
}
