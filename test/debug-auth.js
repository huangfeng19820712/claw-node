#!/usr/bin/env node

/**
 * 调试 Gateway 认证签名
 */

import WebSocket from 'ws'
import { createPrivateKey, sign } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

const homeDir = process.env.HOME || process.env.USERPROFILE
const deviceAuth = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device-auth.json'), 'utf-8'))
const device = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device.json'), 'utf-8'))
const nodeConfig = JSON.parse(readFileSync(join(homeDir, '.openclaw/node.json'), 'utf-8'))

const deviceToken = deviceAuth.tokens.node.token
const deviceId = deviceAuth.deviceId
const privateKey = device.privateKeyPem

console.log('=== 配置信息 ===')
console.log(`Gateway: ${nodeConfig.gateway.host}:${nodeConfig.gateway.port}`)
console.log(`Device ID: ${deviceId}`)
console.log(`Token: ${deviceToken}`)
console.log('')

const ws = new WebSocket(`ws://${nodeConfig.gateway.host}:${nodeConfig.gateway.port}/`)

ws.on('open', () => {
  console.log('WebSocket 已连接')
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  console.log('收到消息:', JSON.stringify(msg, null, 2))

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload.nonce
    const now = Date.now()

    console.log('')
    console.log('=== 构建签名 ===')
    console.log(`Nonce: ${nonce}`)
    console.log(`Timestamp: ${now}`)

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

    console.log('')
    console.log('Payload string:')
    console.log(payloadStr)

    // 签名
    const sig = sign(null, Buffer.from(payloadStr, 'utf8'), createPrivateKey(privateKey))
    const signature = sig.toString('base64url')

    console.log('')
    console.log('Signature:')
    console.log(signature)

    // 发送 connect 请求 - 使用原始公钥字节
    const connectMsg = {
      type: 'req',
      id: `connect-${now}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'node-host',
          displayName: 'Debug-Test',
          version: '1.0.0',
          platform: 'node',
          mode: 'node',
          deviceFamily: 'nodejs',
        },
        device: {
          id: deviceId,
          // 使用原始公钥字节 (32 字节)
          publicKey: Buffer.from(device.publicKeyPem.replace(/-----.*?-----/g, '').replace(/\s/g, ''), 'base64')
            .subarray(12)
            .toString('base64url'),
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
    }

    console.log('')
    console.log('发送 connect 请求...')
    ws.send(JSON.stringify(connectMsg))
  }

  if (msg.type === 'res' && msg.ok) {
    console.log('')
    console.log('✓ 认证成功!')
    console.log('')
    ws.close()
    process.exit(0)
  }

  if (msg.type === 'res' && !msg.ok) {
    console.log('')
    console.log('✗ 认证失败:', msg.error)
    console.log('')
    ws.close()
    process.exit(1)
  }
})

ws.on('error', (err) => {
  console.error('WebSocket 错误:', err.message)
  process.exit(1)
})

ws.on('close', () => {
  console.log('连接已关闭')
})
