#!/usr/bin/env node

/**
 * 使用已保存的凭证进行完整的认证和消息发送测试
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createPrivateKey, sign } from 'crypto'
import WebSocket from 'ws'

const homeDir = process.env.HOME || process.env.USERPROFILE

// 读取已保存的凭证
const deviceAuth = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device-auth.json'), 'utf-8'))
const device = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device.json'), 'utf-8'))
const nodeConfig = JSON.parse(readFileSync(join(homeDir, '.openclaw/node.json'), 'utf-8'))

const deviceId = deviceAuth.deviceId
const deviceToken = deviceAuth.tokens.node.token
const publicKeyPem = device.publicKeyPem
const privateKeyPem = device.privateKeyPem

console.log('====================================')
console.log('  Gateway 认证测试')
console.log('====================================')
console.log('')
console.log(`Gateway: ${nodeConfig.gateway.host}:${nodeConfig.gateway.port}`)
console.log(`Node: ${nodeConfig.displayName}`)
console.log(`Device ID: ${deviceId.slice(0, 20)}...`)
console.log('')

const ws = new WebSocket(`ws://${nodeConfig.gateway.host}:${nodeConfig.gateway.port}/`)

ws.on('open', () => {
  console.log('WebSocket 已连接')
})

ws.on('message', async (data) => {
  const msg = JSON.parse(data.toString())

  // 处理 connect.challenge
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload.nonce
    const now = Date.now()

    console.log('收到 connect.challenge')
    console.log(`Nonce: ${nonce}`)
    console.log('')

    // 构建 V3 载荷
    const payloadStr = [
      'v3',
      deviceId,
      'node-host',
      'node',
      'node',
      '',
      String(now),
      deviceToken,
      nonce,
      'node',
      'nodejs',
    ].join('|')

    // 签名
    const sig = sign(null, Buffer.from(payloadStr, 'utf8'), createPrivateKey(privateKeyPem))
    const signature = sig.toString('base64url')

    console.log('发送 connect 请求...')

    // 发送 connect 请求
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
          publicKey: publicKeyPem,
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
    console.log('✓ 认证成功!')
    console.log('')
    console.log('Protocol:', msg.payload.protocol)
    console.log('Server:', msg.payload.server?.version)
    console.log('')

    // 认证成功，发送测试消息
    console.log('正在发送测试消息到飞书...')

    const callId = `send-${Date.now()}`
    const message = `🔍 ClawNode 测试消息

时间：${new Date().toLocaleString('zh-CN')}
Node: ${nodeConfig.displayName}

如果收到此消息，说明 WebSocket 配置正常！`

    ws.send(JSON.stringify({
      type: 'call',
      payload: {
        callId,
        name: 'send',
        params: {
          to: 'ou_f83886ae0d75c6b709967d289d6a46e3',
          message: message,
          channel: 'feishu',
          accountId: 'manager',
          idempotencyKey: callId,
        },
      },
    }))
    return
  }

  // 处理 call.result
  if (msg.type === 'call.result') {
    console.log('✓ 消息发送成功!')
    console.log('')
    console.log('结果:')
    console.log(JSON.stringify(msg.payload.result, null, 2))
    console.log('')
    ws.close()
    process.exit(0)
    return
  }

  // 处理错误
  if (msg.type === 'res' && !msg.ok) {
    console.log('✗ 错误:', JSON.stringify(msg.error, null, 2))
    return
  }

  // 打印其他消息
  console.log('收到消息:', JSON.stringify(msg, null, 2))
})

ws.on('error', (err) => {
  console.error('WebSocket 错误:', err.message)
  process.exit(1)
})

ws.on('close', (code) => {
  console.log(`连接已关闭，代码：${code}`)
})

// 超时处理
setTimeout(() => {
  console.log('测试超时')
  ws.close()
  process.exit(1)
}, 30000)
