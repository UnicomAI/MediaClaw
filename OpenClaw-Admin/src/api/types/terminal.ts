export type TerminalConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface TerminalSession {
  id: string
  nodeId?: string
  nodeName?: string
  createdAt: number
  lastActivityAt: number
}

export interface TerminalOutputLine {
  id: string
  type: 'stdout' | 'stderr' | 'stdin' | 'system'
  content: string
  timestamp: number
}

export interface TerminalConfig {
  nodeId?: string
  cols: number
  rows: number
  cwd?: string
  env?: Record<string, string>
  shell?: string
  timeout?: number
}

export interface TerminalCreateParams {
  nodeId?: string
  cols?: number
  rows?: number
  cwd?: string
  env?: Record<string, string>
  shell?: string
}

export interface TerminalCreateResult {
  sessionId: string
  success: boolean
  message?: string
}

export interface TerminalWriteParams {
  sessionId: string
  input: string
}

export interface TerminalResizeParams {
  sessionId: string
  cols: number
  rows: number
}

export interface TerminalDestroyParams {
  sessionId: string
}

export interface TerminalListResult {
  sessions: TerminalSession[]
}

export interface TerminalSSEEvent {
  type: 'output' | 'connected' | 'disconnected' | 'error' | 'resized'
  sessionId: string
  data?: string
  cols?: number
  rows?: number
  message?: string
}
