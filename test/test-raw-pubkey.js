#!/usr/bin/env node

/**
 * 测试使用原始公钥字节格式（根据文档）
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

// 提取原始公钥字节 (去掉 SPKI 头部 12 字节)
const publicKeyDer = Buffer.from(device.publicKeyPem.replace(/-----.*?-----/g, '').replace(/\s/g, ''), 'base64')
const publicKeyRaw = publicKeyDer.subarray(12)  // 32 字节原始公钥

console.log('====================================')
console.log('  使用原始公钥字节格式测试')
console.log('====================================')
console.log('')
console.log(`Device ID: ${deviceId.slice(0, 20)}...`)
console.log('')
console.log('公钥格式:')
console.log('PEM 格式:', device.publicKeyPem.substring(0, 40) + '...')
console.log('Raw 格式 (base64url):', publicKeyRaw.toString('base64url'))
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

    // 使用 V2 格式
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

    // 签名
    const sig = sign(null, Buffer.from(payloadStr, 'utf8'), createPrivateKey(privateKeyPem))
    const signature = sig.toString('base64url')

    console.log(`收到 nonce: ${nonce}`)
    console.log('Payload:', payloadStr)
    console.log('Signature:', signature)
    console.log('')

    // 尝试使用 raw 格式公钥
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
          // 使用原始 32 字节公钥
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
