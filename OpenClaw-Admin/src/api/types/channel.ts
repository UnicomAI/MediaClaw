export interface Channel {
  id: string
  platform: ChannelPlatform
  channelKey?: string
  accountId?: string
  enabled: boolean
  status: ChannelStatus
  accountName?: string
  memberCount?: number
  dmPolicy: DMPolicy
  groupPolicy?: string
  requireMention?: boolean
  groupAllowFrom?: string[]
  groups?: ChannelGroup[]
  [key: string]: unknown
}

export type ChannelPlatform =
  | 'whatsapp'
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'signal'
  | 'imessage'
  | 'webchat'
  | 'matrix'
  | string

export type ChannelStatus = 'connected' | 'disconnected' | 'authenticating' | 'error'

export type DMPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled' | string

export interface ChannelGroup {
  id: string
  name: string
  requireMention: boolean
  allowFrom?: string[]
  [key: string]: unknown
}

export interface ChannelAuthParams {
  channelId: string
  channelKey?: string
  accountId?: string
  method?: string
}

export interface PairParams {
  channelId: string
  channelKey?: string
  accountId?: string
  code: string
}
