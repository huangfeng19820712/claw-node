#!/usr/bin/env node

/**
 * 测试使用 agent.request 方式发送消息（详细日志版本）
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createPrivateKey, sign } from 'crypto'
import WebSocket from 'ws'

const homeDir = process.env.HOME || process.env.USERPROFILE

const deviceAuth = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device-auth.json'), 'utf-8'))
const device = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device.json'), 'utf-8'))
const nodeConfig = JSON.parse(readFileSync(join(homeDir, '.openclaw/node.json'), 'utf-8'))

const deviceId = deviceAuth.deviceId
const deviceToken = deviceAuth.tokens.node.token
const privateKeyPem = device.privateKeyPem

// 提取原始公钥字节 (32 bytes)
const publicKeyDer = Buffer.from(device.publicKeyPem.replace(/-----.*?-----/g, '').replace(/\s/g, ''), 'base64')
const publicKeyRaw = publicKeyDer.subarray(12)

const TARGET_USER_ID = 'ou_f83886ae0d75c6b709967d289d6a46e3'

console.log('====================================')
console.log('  测试 agent.request 方式发送消息')
console.log('====================================')
console.log('')
console.log(`目标用户：${TARGET_USER_ID}`)
console.log(`渠道：feishu`)
console.log('')

const ws = new WebSocket(`ws://${nodeConfig.gateway.host}:${nodeConfig.gateway.port}/`)

let messageSent = false
let testComplete = false

ws.on('open', () => {
  console.log('✓ WebSocket 已连接')
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())

  // 处理 connect.challenge
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload.nonce
    const now = Date.now()

    const payloadStr = [
      'v2',
      deviceId,
      'node-host',
      'node',
      'node',
      '',
      String(now),
      deviceToken,
      nonce,
    ].join('|')

    const sig = sign(null, Buffer.from(payloadStr, 'utf8'), createPrivateKey(privateKeyPem))
    const signature = sig.toString('base64url')

    ws.send(JSON.stringify({
      type: 'req',
      id: `connect-${now}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'node-host',
          displayName: nodeConfig.displayName,
          version: '1.0.0',
          platform: 'node',
          mode: 'node',
          deviceFamily: 'nodejs',
        },
        device: {
          id: deviceId,
          publicKey: publicKeyRaw.toString('base64url'),
          signature: signature,
          signedAt: now,
          nonce: nonce,
        },
        auth: {
          deviceToken: deviceToken,
        },
        role: 'node',
        scopes: [],
      },
    }))
    return
  }

  // 处理 connect 响应
  if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
    console.log('✓ 认证成功')
    console.log('')

    // 等待一小段时间再发送，确保 Gateway 已完全初始化
    setTimeout(() => {
      const eventId = `agent-req-${Date.now()}`
      const message = `🔍 测试消息 - ${new Date().toLocaleString('zh-CN')}

这是一条测试消息，如果您收到此消息，说明 agent.request 工作正常。`

      const agentRequestPayload = {
        message: message,
        sessionKey: 'agent:main:feishu:direct:manager',
        deliver: true,
        channel: 'feishu',
        to: TARGET_USER_ID,
        accountId: 'manager',
        receipt: true,
        receiptText: '✓ 已收到',
      }

      const eventReq = {
        type: 'req',
        id: eventId,
        method: 'node.event',
        params: {
          event: 'agent.request',
          payloadJSON: JSON.stringify(agentRequestPayload),
        },
      }

      console.log('发送 agent.request:')
      console.log(JSON.stringify(eventReq, null, 2))
      console.log('')

      ws.send(JSON.stringify(eventReq))
      messageSent = true
    }, 500)

    return
  }

  // 处理 node.event 响应
  if (msg.type === 'res' && msg.id?.startsWith('agent-req-')) {
    console.log('====================================')
    console.log('  Gateway 响应')
    console.log('====================================')
    console.log(`id: ${msg.id}`)
    console.log(`ok: ${msg.ok}`)
    if (msg.payload) {
      console.log(`payload: ${JSON.stringify(msg.payload, null, 2)}`)
    }
    if (msg.error) {
      console.log(`error: ${JSON.stringify(msg.error, null, 2)}`)
    }
    console.log('')
    return
  }

  // 处理 chat 相关事件（Agent 回复）
  if (msg.type === 'event' && (msg.event === 'chat' || msg.event === 'chat.message' || msg.event === 'agent')) {
    console.log('====================================')
    console.log('  收到 Agent 回复事件')
    console.log('====================================')
    console.log(`event: ${msg.event}`)
    console.log(`payload: ${JSON.stringify(msg.payload, null, 2)}`)
    console.log('')
    return
  }

  // 处理其他事件
  if (msg.type === 'event') {
    console.log(`收到事件：${msg.event}`)
    return
  }

  // 打印其他消息
  console.log('收到消息:', JSON.stringify(msg, null, 2))
})

ws.on('error', (err) => {
  console.error('✗ WebSocket 错误:', err.message)
  if (!testComplete) {
    testComplete = true
    process.exit(1)
  }
})

ws.on('close', (code) => {
  console.log(`连接已关闭，代码：${code}`)
  if (!testComplete) {
    testComplete = true
    process.exit(0)
  }
})

// 等待 Gateway 响应和 Agent 处理
setTimeout(() => {
  if (messageSent) {
    console.log('')
    console.log('====================================')
    console.log('  测试结果')
    console.log('====================================')
    console.log('Gateway 已接收请求，Agent 正在处理...')
    console.log('请检查飞书是否收到消息')
    console.log('')
  }
  ws.close()
  testComplete = true
  process.exit(0)
}, 10000)
