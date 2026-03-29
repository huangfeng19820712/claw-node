import WebSocket from 'ws'
import { createPrivateKey, sign, generateKeyPairSync } from 'crypto'
import { EventEmitter } from 'events'

/**
 * WebSocket 发送器配置
 */
export interface WebSocketSenderConfig {
  gatewayHost: string
  gatewayPort: number
  deviceToken: string
  deviceId: string
  privateKey: string  // base64url 格式或 PEM 格式的私钥
  publicKey: string   // base64url 格式或 PEM 格式的公钥
  displayName?: string
  timeout?: number
}

/**
 * 发送消息选项
 */
export interface SendMessageOptions {
  channel?: string
  accountId?: string
  idempotencyKey?: string
  timeout?: number
}

/**
 * Agent 请求选项
 */
export interface AgentRequestOptions {
  sessionKey?: string
  channel?: string
  to?: string
  deliver?: boolean
  receipt?: boolean
  receiptText?: string
  thinking?: 'low' | 'medium' | 'high'
  timeoutSeconds?: number
}

/**
 * Agent 请求结果
 */
export interface AgentRequestResult {
  ok: boolean
  payload?: any
}

/**
 * 发送结果
 */
export interface SendResult {
  messageId: string
  channel: string
  toJid: string
}

/**
 * WebSocket 发送器
 * 通过 WebSocket node.event 向 Gateway 发送 agent.request 事件
 */
export class WebSocketSender extends EventEmitter {
  private config: Required<WebSocketSenderConfig>
  private ws: WebSocket | null = null
  private connected = false
  private connectNonce: string | null = null
  private pendingCalls = new Map<string, {
    resolve: (result: SendResult) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()
  private pendingAgentCalls = new Map<string, {
    resolve: (result: AgentRequestResult) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()
  private connectPromise: Promise<void> | null = null

  constructor(config: WebSocketSenderConfig) {
    super()
    this.config = {
      timeout: 30000,
      displayName: 'ClawNode',
      ...config
    }
  }

  /**
   * 连接到 Gateway
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return Promise.resolve()
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const protocol = this.config.gatewayPort === 443 ? 'wss' : 'ws'
      const wsUrl = `${protocol}://${this.config.gatewayHost}:${this.config.gatewayPort}/`

      console.log('[WebSocketSender] Connecting to:', wsUrl)

      this.ws = new WebSocket(wsUrl)

      const connectTimeout = setTimeout(() => {
        this.ws?.close()
        this.ws = null
        this.connectPromise = null
        reject(new Error('Connection timeout'))
      }, this.config.timeout)

      this.ws.once('open', () => {
        console.log('[WebSocketSender] WebSocket connected')
        this.connected = true
      })

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString(), resolve, reject)
      })

      this.ws.once('error', (err: Error) => {
        clearTimeout(connectTimeout)
        this.connectPromise = null
        this.connected = false
        reject(new Error(`WebSocket error: ${err.message}`))
      })

      this.ws.once('close', (code: number, reason: Buffer) => {
        console.log('[WebSocketSender] WebSocket closed:', code, reason?.toString())
        this.connected = false
        this.ws = null
        this.connectPromise = null
      })
    })

    return this.connectPromise
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(
    message: string,
    connectResolve: (value: void) => void,
    connectReject: (reason: Error) => void
  ): void {
    try {
      const msg = JSON.parse(message)

      // 处理 connect.challenge
      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        this.connectNonce = msg.payload?.nonce || null
        console.log('[WebSocketSender] Received connect challenge')
        this.sendConnectRequest()
        return
      }

      // 处理 connect 响应
      if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
        console.log('[WebSocketSender] Connected successfully')
        connectResolve()
        return
      }

      // 处理 node.event 响应（agent.request）
      if (msg.type === 'res' && msg.id?.startsWith('agent-req-')) {
        const pending = this.pendingAgentCalls.get(msg.id)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingAgentCalls.delete(msg.id)
          if (msg.ok) {
            pending.resolve({ ok: true, payload: msg.payload })
          } else {
            pending.reject(new Error(msg.error?.message || 'Agent request failed'))
          }
        }
        return
      }

      // 处理错误响应
      if (msg.type === 'res' && !msg.ok) {
        console.error('[WebSocketSender] Error:', msg.error)
      }
    } catch (err) {
      console.error('[WebSocketSender] Parse error:', (err as Error).message)
    }
  }

  /**
   * 发送 connect 请求
   */
  private sendConnectRequest(): void {
    if (!this.connectNonce) {
      console.error('[WebSocketSender] Cannot send connect without nonce')
      return
    }

    const now = Date.now()
    const nonce = this.connectNonce

    // 构建签名字载荷 (V2 格式 - 根据 node-gateway-authentication.md)
    // 使用空 scopes，通过 node.event 方式调用 agent.request
    const payloadStr = this.buildDeviceAuthPayloadV2({
      deviceId: this.config.deviceId,
      clientId: 'node-host',
      clientMode: 'node',
      role: 'node',
      scopes: [],
      signedAtMs: now,
      token: this.config.deviceToken,
      nonce: nonce,
    })

    // 签名
    const signature = this.signPayload(payloadStr)

    // 处理公钥格式 - 如果是 PEM 格式，转换为原始字节格式
    let publicKey: string
    if (this.config.publicKey.includes('-----')) {
      // PEM 格式，提取原始字节
      const publicKeyDer = this.base64UrlDecode(
        this.config.publicKey.replace(/-----.*?-----/g, '').replace(/\s/g, '')
      )
      // 去掉 SPKI 头部（12 字节），获取 32 字节原始公钥
      publicKey = publicKeyDer.subarray(12).toString('base64url')
    } else {
      // 已经是 base64url 格式
      publicKey = this.config.publicKey
    }

    const connectMessage = {
      type: 'req',
      id: `connect-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'node-host',
          displayName: this.config.displayName,
          version: '1.0.0',
          platform: 'node',
          mode: 'node',
          deviceFamily: 'nodejs',
        },
        device: {
          id: this.config.deviceId,
          publicKey: publicKey,
          signature: signature,
          signedAt: now,
          nonce: nonce,
        },
        auth: {
          deviceToken: this.config.deviceToken,
        },
        role: 'node',
        scopes: [],
      },
    }

    console.log('[WebSocketSender] Sending connect request')
    this.ws?.send(JSON.stringify(connectMessage))
  }

  /**
   * 构建 V2 设备认证载荷（根据 node-gateway-authentication.md）
   * 格式：v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce
   */
  private buildDeviceAuthPayloadV2(params: {
    deviceId: string
    clientId: string
    clientMode: string
    role: string
    scopes: string[]
    signedAtMs: number
    token: string
    nonce: string
  }): string {
    const scopes = params.scopes.join(',')
    const token = params.token || ''
    return [
      'v2',
      params.deviceId,
      params.clientId,
      params.clientMode,
      params.role,
      scopes,
      String(params.signedAtMs),
      token,
      params.nonce,
    ].join('|')
  }

  /**
   * 构建 V3 设备认证载荷
   */
  private buildDeviceAuthPayloadV3(params: {
    deviceId: string
    clientId: string
    clientMode: string
    role: string
    scopes: string[]
    signedAtMs: number
    token: string
    nonce: string
    platform: string
    deviceFamily: string
  }): string {
    const scopes = params.scopes.join(',')
    const token = params.token || ''
    const platform = (params.platform || '').trim().toLowerCase()
    const deviceFamily = (params.deviceFamily || '').trim().toLowerCase()
    return [
      'v3',
      params.deviceId,
      params.clientId,
      params.clientMode,
      params.role,
      scopes,
      String(params.signedAtMs),
      token,
      params.nonce,
      platform,
      deviceFamily,
    ].join('|')
  }

  /**
   * 使用 ED25519 私钥签名载荷
   */
  private signPayload(payload: string): string {
    // 如果私钥是 base64url 格式（原始字节），转换为 PEM
    let privateKeyPem: string
    if (this.config.privateKey.includes('-')) {
      // 已经是 PEM 格式
      privateKeyPem = this.config.privateKey
    } else {
      // base64url 格式，转换为 PEM
      const privateKeyBytes = this.base64UrlDecode(this.config.privateKey)
      privateKeyPem = this.privateKeyBytesToPem(privateKeyBytes)
    }

    const sig = sign(null, Buffer.from(payload, 'utf8'), createPrivateKey(privateKeyPem))
    return this.base64UrlEncode(sig)
  }

  /**
   * Base64URL 解码
   */
  private base64UrlDecode(input: string): Buffer {
    const normalized = input.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    return Buffer.from(padded, 'base64')
  }

  /**
   * Base64URL 编码
   */
  private base64UrlEncode(buf: Buffer): string {
    return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
  }

  /**
   * 私钥字节转 PEM
   */
  private privateKeyBytesToPem(privateKeyBytes: Buffer): string {
    const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
    const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, privateKeyBytes])
    const pem = pkcs8Der.toString('base64').match(/.{1,64}/g)!.join('\n')
    return `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`
  }

  /**
   * 发送消息到渠道（使用 agent.request 方式）
   */
  async sendMessage(to: string, message: string, options: SendMessageOptions = {}): Promise<SendResult> {
    const result = await this.sendAgentRequest(message, {
      sessionKey: options.channel === 'feishu' ? 'agent:main:feishu:direct:manager' : undefined,
      channel: options.channel,
      to,
      deliver: true,
      receipt: false,
    })

    // 转换为 SendResult 格式
    return {
      messageId: result.payload?.messageId || `agent-${Date.now()}`,
      channel: options.channel || 'feishu',
      toJid: to,
    }
  }

  /**
   * 发送 Agent 请求（通过 node.event 调用 agent.request）
   */
  async sendAgentRequest(message: string, options: AgentRequestOptions = {}): Promise<AgentRequestResult> {
    if (!this.connected || !this.ws) {
      await this.connect()
    }

    return new Promise((resolve, reject) => {
      const callId = `agent-req-${Date.now()}-${Math.random().toString(36).slice(2)}`

      const agentRequestPayload = {
        message: message.trim(),
        sessionKey: options.sessionKey || `node-${this.config.deviceId}`,
        thinking: options.thinking,
        deliver: options.deliver ?? true,
        channel: options.channel,
        to: options.to,
        receipt: options.receipt,
        receiptText: options.receiptText,
        timeoutSeconds: options.timeoutSeconds,
      }

      // 使用 node.event 发送 agent.request 事件
      const eventReq = {
        type: 'req',
        id: callId,
        method: 'node.event',
        params: {
          event: 'agent.request',
          payloadJSON: JSON.stringify(agentRequestPayload),
        },
      }

      const timeout = setTimeout(() => {
        this.pendingAgentCalls.delete(callId)
        reject(new Error('Agent request timeout'))
      }, options.timeoutSeconds ? options.timeoutSeconds * 1000 : this.config.timeout)

      this.pendingAgentCalls.set(callId, { resolve, reject, timeout })
      this.ws?.send(JSON.stringify(eventReq))
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    // 清理所有待处理的调用
    for (const [callId, pending] of this.pendingCalls.entries()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Disconnected'))
    }
    this.pendingCalls.clear()

    // 清理所有待处理的 agent 请求
    for (const [callId, pending] of this.pendingAgentCalls.entries()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Disconnected'))
    }
    this.pendingAgentCalls.clear()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
    this.connectPromise = null
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * 生成 ED25519 密钥对（辅助工具）
   */
  static generateKeyPair(): { privateKey: string; publicKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')

    const publicKeyBytes = publicKey.export({ type: 'spki', format: 'der' })
    const privateKeyBytes = privateKey.export({ type: 'pkcs8', format: 'der' })

    // ED25519 SPKI 公钥：12 字节头部 + 32 字节原始公钥
    // ED25519 PKCS8 私钥：16 字节头部 + 32 字节原始私钥
    const rawPrivateKey = privateKeyBytes.subarray(16)
    const rawPublicKey = publicKeyBytes.subarray(12)

    return {
      privateKey: rawPrivateKey.toString('base64url'),
      publicKey: rawPublicKey.toString('base64url'),
    }
  }
}
