export interface RPCRequest {
  type: 'req'
  id: string
  method: string
  params?: unknown
}

export interface RPCResponse<T = unknown> {
  type: 'res'
  id: string
  ok: boolean
  payload?: T
  error?: RPCError
}

export interface RPCEvent {
  type: 'event'
  event: string
  payload: unknown
  seq?: number
}

export interface RPCError {
  code?: string | number
  message: string
  details?: unknown
  data?: unknown
  retryable?: boolean
  retryAfterMs?: number
}

export type RPCFrame = RPCRequest | RPCResponse | RPCEvent

export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed',
} as const

export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState]
