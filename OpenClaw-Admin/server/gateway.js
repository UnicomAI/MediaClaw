import { readFileSync } from 'fs'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import EventEmitter from 'events'
import { createHash, generateKeyPairSync, sign } from 'crypto'

const APP_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
).version || ''

export class OpenClawGateway extends EventEmitter {
  constructor(url, authToken, authPassword, logLevel = 'INFO') {
    super()
    this.url = url
    this.authToken = authToken
    this.authPassword = authPassword
    this.logLevel = logLevel
    this.isDebug = logLevel === 'DEBUG'
    this.ws = null
    this.isConnected = false
    this.pendingCalls = new Map()
    this.connectId = null
    this.nonce = null
    this.connectSent = false
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.deviceIdentity = null
  }

  debug(...args) {
    if (this.isDebug) {
      console.log('[Gateway]', ...args)
    }
  }

  async connect() {
    if (this.ws) {
      this.ws.close()
    }

    const authParam = this.authToken || this.authPassword || ''
    const wsUrl = authParam ? `${this.url}?auth=${authParam}` : this.url
    
    this.debug('Connecting to:', this.url)
    this.debug('Auth configured:', {
      hasToken: !!this.authToken,
      hasPassword: !!this.authPassword,
      tokenLength: this.authToken?.length || 0,
      passwordLength: this.authPassword?.length || 0
    })
    
    try {
      this.ws = new WebSocket(wsUrl)
      
      this.ws.on('open', () => {
        this.debug('WebSocket opened, preparing connect frame...')
        this.connectId = `connect-${Date.now()}`
        this.nonce = null
        this.connectSent = false
        this.emit('stateChange', 'connecting')
        
        setTimeout(() => {
          if (!this.connectSent) {
            this.debug('Sending connect frame (no challenge received)')
            this.sendConnect()
          }
        }, 500)
      })

      this.ws.on('message', (data) => {
        this.debug('Received message:', data.toString().substring(0, 500))
        this.handleMessage(data)
      })

      this.ws.on('close', (code, reason) => {
        this.debug('WebSocket closed:', { code, reason: reason.toString() })
        this.handleDisconnect(code, reason.toString())
      })

      this.ws.on('error', (err) => {
        console.error('[Gateway] WebSocket error:', err.message)
        this.emit('error', err)
      })
    } catch (err) {
      console.error('[Gateway] Connection failed:', err.message)
      this.emit('error', err)
      this.scheduleReconnect()
    }
  }

  async sendConnect() {
    if (this.connectSent || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.debug('sendConnect skipped:', { 
        connectSent: this.connectSent, 
        wsReady: this.ws?.readyState, 
        wsOpen: this.ws?.readyState === WebSocket.OPEN 
      })
      return
    }
    
    this.connectSent = true

    const connectParams = await this.buildConnectParams()
    
    this.debug('Sending connect frame with params:', {
      clientId: connectParams.client?.id,
      clientMode: connectParams.client?.mode,
      role: connectParams.role,
      scopes: connectParams.scopes,
      hasDevice: !!connectParams.device,
      hasToken: !!connectParams.auth?.token,
      hasPassword: !!connectParams.auth?.password,
      caps: connectParams.caps
    })

    const frame = {
      type: 'req',
      id: this.connectId,
      method: 'connect',
      params: connectParams,
    }

    this.ws.send(JSON.stringify(frame))
  }

  async buildConnectParams() {
    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'cli',
        displayName: 'OpenClaw Web Backend',
        version: APP_VERSION,
        platform: process.platform,
        mode: 'cli',
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write', 'operator.admin'],
      caps: ['tool-events'],
      commands: [],
      permissions: {},
      auth: {
        token: this.authToken || '',
        password: this.authPassword || '', // 支持 password 认证
      },
      locale: 'zh-CN',
      userAgent: `OpenClaw-Web-Backend/${APP_VERSION}`,
    }

    try {
      if (!this.deviceIdentity) {
        this.deviceIdentity = await this.generateDeviceIdentity()
      }

      const signedAtMs = Date.now()
      const payload = this.buildDeviceAuthPayload({
        deviceId: this.deviceIdentity.deviceId,
        clientId: params.client.id,
        clientMode: params.client.mode,
        role: params.role,
        scopes: params.scopes,
        signedAtMs,
        token: params.auth.token ?? null,
        nonce: this.nonce || null,
      })

      const signature = await this.signDevicePayload(
        this.deviceIdentity.privateKey,
        payload
      )

      params.device = {
        id: this.deviceIdentity.deviceId,
        publicKey: this.deviceIdentity.publicKey,
        signature,
        signedAt: signedAtMs,
        ...(this.nonce ? { nonce: this.nonce } : {}),
      }
    } catch (e) {
      this.debug('Device identity generation failed, using legacy mode:', e.message)
    }

    return params
  }

  async generateDeviceIdentity() {
    const { publicKey, privateKey } = this.generateEd25519KeyPair()
    const publicKeyRaw = Buffer.from(publicKey, 'base64')
    const deviceId = this.bytesToHex(createHash('sha256').update(publicKeyRaw).digest())

    return {
      deviceId,
      publicKey,
      privateKey,
    }
  }

  generateEd25519KeyPair() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    
    const publicKeyRaw = publicKey.export({ type: 'spki', format: 'der' }).slice(-32)
    const privateKeyRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).slice(-32)
    
    return {
      publicKey: this.base64UrlEncode(publicKeyRaw),
      privateKey: this.base64UrlEncode(privateKeyRaw),
    }
  }

  buildDeviceAuthPayload(params) {
    const version = params.nonce ? 'v2' : 'v1'
    const scopes = params.scopes.join(',')
    const token = params.token ?? ''
    const base = [
      version,
      params.deviceId,
      params.clientId,
      params.clientMode,
      params.role,
      scopes,
      String(params.signedAtMs),
      token,
    ]
    if (version === 'v2') {
      base.push(params.nonce ?? '')
    }
    return base.join('|')
  }

  async signDevicePayload(privateKeyBase64Url, payload) {
    const privateKeyRaw = Buffer.from(
      privateKeyBase64Url.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    )
    const data = Buffer.from(payload, 'utf-8')

    const signature = sign(null, data, {
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        privateKeyRaw,
      ]),
      format: 'der',
      type: 'pkcs8',
    })

    return this.base64UrlEncode(signature.slice(-64))
  }

  base64UrlEncode(buffer) {
    return buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }

  bytesToHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  handleMessage(data) {
    try {
      const frame = JSON.parse(data.toString())

      if (frame.type === 'event') {
        this.debug('Received event:', frame.event, 'payload keys:', frame.payload ? Object.keys(frame.payload) : null)
        
        if (frame.event === 'connect.challenge') {
          this.debug('Received connect.challenge, nonce:', frame.payload?.nonce?.substring(0, 16) + '...')
          this.nonce = frame.payload?.nonce
          if (this.nonce && !this.connectSent) {
            this.debug('Sending connect frame after challenge')
            this.sendConnect()
          }
        } else {
          this.emit('event', frame.event, frame.payload)
        }
        return
      }

      if (frame.type === 'res') {
        if (frame.id === this.connectId) {
          this.handleConnectResponse(frame)
          return
        }

        const pending = this.pendingCalls.get(frame.id)
        if (pending) {
          this.pendingCalls.delete(frame.id)
          clearTimeout(pending.timer)
          if (frame.ok) {
            pending.resolve(frame.payload)
          } else {
            console.error('[Gateway] RPC call failed:', frame.id, frame.error)
            pending.reject(new Error(frame.error?.message || 'RPC call failed'))
          }
        }
      }
    } catch (e) {
      console.error('[Gateway] Failed to handle message:', e.message)
    }
  }

  handleConnectResponse(frame) {
    this.debug('Connect response received:', {
      ok: frame.ok,
      error: frame.error,
      payloadKeys: frame.payload ? Object.keys(frame.payload) : null
    })
    
    this.connectId = null

    if (frame.ok) {
      this.isConnected = true
      this.emit('stateChange', 'connected')
      this.emit('connected', frame.payload)
      this.startHeartbeat()
      
      this.debug('Connected payload keys:', Object.keys(frame.payload || {}))
      
      const snapshot = frame.payload?.snapshot
      this.debug('Snapshot keys:', snapshot ? Object.keys(snapshot) : 'No snapshot')
      
      const updateInfo = snapshot?.updateAvailable
      const serverVersion = frame.payload?.server?.version
      this.debug('Update info:', updateInfo)
      this.debug('Server version:', serverVersion)
      
      if (updateInfo) {
        this.debug('Emitting version event with:', updateInfo)
        this.emit('version', updateInfo)
      } else if (serverVersion) {
        this.debug('Emitting version event with server version:', serverVersion)
        this.emit('version', { currentVersion: serverVersion, latestVersion: serverVersion, channel: 'latest' })
      } else {
        this.debug('No version info found')
      }
    } else {
      const error = frame.error?.message || 'Connection failed'
      console.error('[Gateway] Connect failed:', error)
      this.debug('Full error response:', JSON.stringify(frame.error, null, 2))
      this.emit('error', new Error(error))
      this.emit('stateChange', 'failed')
      this.ws?.close()
    }
  }

  handleDisconnect(code, reason) {
    this.isConnected = false
    this.connectSent = false
    this.connectId = null
    this.clearTimers()
    
    this.emit('stateChange', 'disconnected')
    this.emit('disconnected', code, reason)

    for (const [id, pending] of this.pendingCalls) {
      pending.reject(new Error('Connection closed'))
    }
    this.pendingCalls.clear()

    this.scheduleReconnect()
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
        this.call('health').catch(() => {})
      }
    }, 30000)
  }

  clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  call(method, params, timeout = 160000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

      const id = `rpc-${randomUUID()}`
      const frame = { type: 'req', id, method, params }

      const timer = setTimeout(() => {
        this.pendingCalls.delete(id)
        reject(new Error(`RPC call "${method}" timed out`))
      }, timeout)

      this.pendingCalls.set(id, { resolve, reject, timer })
      this.ws.send(JSON.stringify(frame))
    })
  }

  disconnect() {
    this.clearTimers()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}
