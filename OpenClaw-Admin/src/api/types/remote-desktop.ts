export type RemoteDesktopConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export type RemoteDesktopPlatform = 'linux' | 'windows' | 'unknown'

export type RemoteDesktopStatus = 'creating' | 'ready' | 'connected' | 'disconnected' | 'error' | 'destroyed'

export interface RemoteDesktopSession {
  id: string
  nodeId?: string
  nodeName?: string
  platform: RemoteDesktopPlatform
  status: RemoteDesktopStatus
  width: number
  height: number
  depth: number
  vncPort?: number
  websocketPort?: number
  password?: string
  createdAt: number
  lastActivityAt: number
  error?: string
  frameData?: string
}

export interface RemoteDesktopConfig {
  nodeId?: string
  width: number
  height: number
  depth?: number
  compression?: number
  quality?: number
  timeout?: number
  shared?: boolean
  viewOnly?: boolean
  scale?: boolean
}

export interface RemoteDesktopCreateParams {
  nodeId?: string
  width?: number
  height?: number
  depth?: number
  timeout?: number
}

export interface RemoteDesktopCreateResult {
  sessionId: string
  success: boolean
  message?: string
  vncPort?: number
  websocketPort?: number
  password?: string
}

export interface RemoteDesktopResizeParams {
  sessionId: string
  width: number
  height: number
}

export interface RemoteDesktopDestroyParams {
  sessionId: string
}

export interface RemoteDesktopListResult {
  sessions: RemoteDesktopSession[]
}

export interface RemoteDesktopInputEvent {
  sessionId: string
  type: 'mouse' | 'keyboard' | 'clipboard'
  data: RemoteDesktopMouseData | RemoteDesktopKeyboardData | RemoteDesktopClipboardData
}

export interface RemoteDesktopMouseData {
  action: 'move' | 'click' | 'dblclick' | 'down' | 'up' | 'wheel'
  x: number
  y: number
  button?: number
  buttons?: number
  wheelDeltaX?: number
  wheelDeltaY?: number
}

export interface RemoteDesktopKeyboardData {
  action: 'down' | 'up' | 'press'
  key: string
  code: string
  keyCode: number
  shiftKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
}

export interface RemoteDesktopClipboardData {
  text: string
}

export interface RemoteDesktopSSEEvent {
  type: 'connected' | 'disconnected' | 'error' | 'resized' | 'frame'
  sessionId: string
  data?: string
  width?: number
  height?: number
  message?: string
}

export interface RemoteDesktopNode {
  id: string
  name: string
  platform: RemoteDesktopPlatform
  connected: boolean
  capabilities: string[]
  hasDesktop: boolean
  lastSeen?: string
}
