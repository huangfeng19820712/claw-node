#!/usr/bin/env node

/**
 * 测试不同的 payload 格式
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
const publicKeyPem = device.publicKeyPem

console.log('====================================')
console.log('  测试 Payload 格式')
console.log('====================================')
console.log('')
console.log(`Device ID: ${deviceId.slice(0, 20)}...`)
console.log(`Device Token: ${deviceToken.slice(0, 20)}...`)
console.log('')

const ws = new WebSocket(`ws://${nodeConfig.gateway.host}:${nodeConfig.gateway.port}/`)

let testIndex = 0

ws.on('open', () => {
  console.log('WebSocket 已连接')
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload.nonce
    const now = Date.now()

    // 测试不同的 payload 格式
    const payloadFormats = [
      // 格式 1: 完整 V3
      [
        'v3', deviceId, 'node-host', 'node', 'node', '',
        String(now), deviceToken, nonce, 'node', 'nodejs'
      ].join('|'),
      // 格式 2: V3 无 platform
      [
        'v3', deviceId, 'node-host', 'node', 'node', '',
        String(now), deviceToken, nonce
      ].join('|'),
      // 格式 3: V3 无 role 和 scopes
      [
        'v3', deviceId, 'node-host', 'node', '',
        String(now), deviceToken, nonce
      ].join('|'),
      // 格式 4: 不带 scopes 分隔符
      [
        'v3', deviceId, 'node-host', 'node', 'node',
        String(now), deviceToken, nonce, 'node', 'nodejs'
      ].join('|'),
    ]

    console.log(`收到 nonce: ${nonce}`)
    console.log('')

    // 使用第一个格式（完整 V3）
    const payloadStr = payloadFormats[0]
    console.log('使用 Payload:')
    console.log(payloadStr)
    console.log('')

    const sig = sign(null, Buffer.from(payloadStr, 'utf8'), createPrivateKey(privateKeyPem))
    const signature = sig.toString('base64url')

    console.log('Signature:')
    console.log(signature)
    console.log('')

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

  if (msg.type === 'res' && msg.ok) {
    console.log('✓ 认证成功!')
    ws.close()
    process.exit(0)
  }

  if (msg.type === 'res' && !msg.ok) {
    console.log('✗ 失败:', msg.error)
    ws.close()
    process.exit(1)
  }
})

ws.on('error', (err) => {
  console.error('Error:', err.message)
  process.exit(1)
})

setTimeout(() => {
  console.log('超时')
  ws.close()
  process.exit(1)
}, 15000)
