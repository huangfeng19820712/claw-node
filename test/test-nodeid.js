#!/usr/bin/env node

/**
 * 尝试使用不同的 deviceId 和 token 组合
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createPrivateKey, sign, generateKeyPairSync } from 'crypto'
import WebSocket from 'ws'

const homeDir = process.env.HOME || process.env.USERPROFILE

const deviceAuth = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device-auth.json'), 'utf-8'))
const device = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device.json'), 'utf-8'))
const nodeConfig = JSON.parse(readFileSync(join(homeDir, '.openclaw/node.json'), 'utf-8'))

// 尝试使用 node.json 中的 nodeId
const nodeIdFromConfig = nodeConfig.nodeId
const deviceIdFromAuth = deviceAuth.deviceId
const deviceToken = deviceAuth.tokens.node.token

console.log('====================================')
console.log('  测试不同的 Device ID')
console.log('====================================')
console.log('')
console.log(`Node ID (from node.json): ${nodeIdFromConfig}`)
console.log(`Device ID (from auth): ${deviceIdFromAuth}`)
console.log(`Device Token: ${deviceToken}`)
console.log('')

// 生成新的密钥对用于测试
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })

console.log('使用新生成的密钥对进行测试...')
console.log('')

const ws = new WebSocket(`ws://${nodeConfig.gateway.host}:${nodeConfig.gateway.port}/`)

ws.on('open', () => {
  console.log('WebSocket 已连接')
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())

  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload.nonce
    const now = Date.now()

    // 尝试使用 nodeId 作为 deviceId
    const testDeviceId = nodeIdFromConfig

    // 构建 V3 载荷
    const payloadStr = [
      'v3',
      testDeviceId,
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

    console.log('尝试使用 nodeId 作为 deviceId:')
    console.log(`DeviceId: ${testDeviceId}`)
    console.log(`Payload: ${payloadStr}`)
    console.log(`Signature: ${signature}`)
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
          id: testDeviceId,
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
