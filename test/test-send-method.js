#!/usr/bin/env node

/**
 * 测试调用 send 方法 - 使用正确的帧格式
 */

import { readFileSync } from 'fs'
import { join } from 'path'
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

console.log('====================================')
console.log('  测试 send 方法调用')
console.log('====================================')
console.log('')

import { createPrivateKey, sign } from 'crypto'

const ws = new WebSocket(`ws://${nodeConfig.gateway.host}:${nodeConfig.gateway.port}/`)

ws.on('open', () => {
  console.log('✓ WebSocket 已连接')
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())

  // 处理 connect.challenge
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload.nonce
    const now = Date.now()

    // V2 格式，scopes 为 'send'
    const payloadStr = [
      'v2',
      deviceId,
      'node-host',
      'node',
      'node',
      'send',  // 请求 send scope
      String(now),
      deviceToken,
      nonce,
    ].join('|')

    const sig = sign(null, Buffer.from(payloadStr, 'utf8'), createPrivateKey(privateKeyPem))
    const signature = sig.toString('base64url')

    // 发送 connect 请求，请求 send 权限
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
        scopes: ['send'],  // 请求 send 权限
      },
    }))
    return
  }

  // 处理 connect 响应
  if (msg.type === 'res' && msg.ok) {
    console.log('✓ 认证成功!')
    console.log('')
    console.log('响应 payload:', JSON.stringify(msg.payload, null, 2))
    console.log('')

    // 认证成功，发送测试消息
    console.log('正在发送测试消息到飞书...')

    const callId = `send-${Date.now()}`
    const message = `🔍 ClawNode WebSocket 测试

时间：${new Date().toLocaleString('zh-CN')}
Node: ${nodeConfig.displayName}

如果收到此消息，说明 WebSocket 配置正常！`

    // 使用 req/res 格式
    ws.send(JSON.stringify({
      type: 'req',
      id: callId,
      method: 'send',
      params: {
        to: 'ou_f83886ae0d75c6b709967d289d6a46e3',
        message: message,
        channel: 'feishu',
        accountId: 'manager',
        idempotencyKey: callId,
      },
    }))
    return
  }

  // 处理 send 方法响应
  if (msg.type === 'res' && msg.id?.startsWith('send-')) {
    if (msg.ok) {
      console.log('✓ 消息发送成功!')
      console.log('')
      console.log('结果:', JSON.stringify(msg.payload, null, 2))
      console.log('')
      ws.close()
      process.exit(0)
    } else {
      console.log('✗ 发送失败:', JSON.stringify(msg.error, null, 2))
      console.log('')
      ws.close()
      process.exit(1)
    }
    return
  }

  // 打印其他消息
  console.log('收到消息:', JSON.stringify(msg, null, 2))
})

ws.on('error', (err) => {
  console.error('✗ WebSocket 错误:', err.message)
  process.exit(1)
})

ws.on('close', (code) => {
  console.log(`连接已关闭，代码：${code}`)
})

setTimeout(() => {
  console.log('测试超时')
  ws.close()
  process.exit(1)
}, 30000)
