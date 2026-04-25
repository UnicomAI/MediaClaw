export interface OpenClawConfig {
  agents?: AgentConfig
  channels?: Record<string, ChannelConfig>
  plugins?: PluginsConfig
  bindings?: Binding[]
  tools?: ToolsConfig
  session?: SessionConfig
  gateway?: GatewayConfig
  models?: ModelsConfig
}

export interface PluginsConfig {
  enabled?: boolean
  allow?: string[]
  deny?: string[]
  load?: {
    paths?: string[]
  }
  entries?: Record<string, PluginEntryConfig>
  installs?: Record<string, PluginInstallRecord>
}

export interface PluginEntryConfig {
  enabled?: boolean
  config?: Record<string, unknown>
  [key: string]: unknown
}

export interface PluginInstallRecord {
  source?: 'npm' | 'archive' | 'path' | string
  spec?: string
  sourcePath?: string
  installPath?: string
  version?: string
  installedAt?: string
  [key: string]: unknown
}

export interface AgentConfig {
  defaults?: AgentDefaults
  list?: AgentInstance[]
}

export interface AgentDefaults {
  workspace?: string
  model?: ModelConfig
  tools?: ToolPolicyConfig
  models?: Record<string, { alias?: string }>
}

export interface AgentInstance {
  id: string
  name?: string
  workspace?: string
  model?: ModelConfig
  tools?: ToolPolicyConfig
  sandbox?: SandboxConfig
  subagents?: {
    allowAgents?: string[]
    denyAgents?: string[]
  }
  identity?: {
    name?: string
    theme?: string
    emoji?: string
    avatar?: string
  }
}

export interface ModelConfig {
  primary?: string
  fallback?: string[]
}

export interface ToolPolicyConfig {
  allow?: string[]
  deny?: string[]
  profile?: 'minimal' | 'coding' | 'full'
}

export interface ChannelSecretField {
  path: string
  label?: string
  required?: boolean
  masked?: string
}

export interface ChannelAccountConfig {
  enabled?: boolean
  dmPolicy?: string
  allowFrom?: string[]
  groupPolicy?: string
  requireMention?: boolean
  groupAllowFrom?: string[]
  groups?: Record<string, unknown>
  [key: string]: unknown
}

export interface ChannelConfig {
  enabled?: boolean
  dmPolicy?: string
  allowFrom?: string[]
  groupPolicy?: string
  requireMention?: boolean
  groupAllowFrom?: string[]
  groups?: Record<string, unknown>
  accounts?: Record<string, ChannelAccountConfig>
  secretFields?: ChannelSecretField[]
  [key: string]: unknown
}

export interface Binding {
  channel?: string
  agentId?: string
  match?: {
    channel: string
    accountId?: string
    peer?: {
      kind: 'direct' | 'group' | 'channel' | 'dm' | 'acp'
      id: string
    }
  }
}

export interface ToolsConfig {
  allow?: string[]
  deny?: string[]
  profile?: string
  sandbox?: SandboxConfig
  sessions?: {
    visibility?: string
  }
  agentToAgent?: {
    enabled?: boolean
    allow?: string[]
  }
}

export interface SandboxConfig {
  enabled: boolean
  docker?: Record<string, unknown>
}

export interface SessionConfig {
  reset?: { mode: string; hour?: number; idleMinutes?: number }
  queue?: { mode: string }
}

export interface GatewayConfig {
  port?: number
  bind?: string
  auth?: { token?: string; allowTailscale?: boolean }
  controlUi?: { basePath?: string }
}

export interface ModelsConfig {
  primary?: string
  fallback?: string[]
  mode?: 'merge' | 'replace' | string
  providers?: Record<string, ModelProviderConfig>
}

export interface ModelProviderConfig {
  api?: 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-generative-ai' | string
  baseUrl?: string
  apiKey?: string
  authHeader?: boolean
  headers?: Record<string, string>
  modelPrefix?: string
  models?: ModelProviderModel[]
}

export interface ModelProviderModel {
  id: string
  name?: string
  enabled?: boolean
  contextWindow?: number
  tags?: string[]
}

export interface ConfigPatch {
  path: string
  value: unknown
}
