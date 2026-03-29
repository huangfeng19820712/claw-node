#!/usr/bin/env node

/**
 * 完整的 Gateway 认证测试 - 生成新密钥并获取新 token
 */

import { generateKeyPairSync, sign, createPrivateKey } from 'crypto'
import WebSocket from 'ws'

// 1. 生成新的密钥对
console.log('=== 步骤 1: 生成新的密钥对 ===')
const { publicKey, privateKey } = generateKeyPairSync('ed25519')

const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })

console.log('公钥:')
console.log(publicKeyPem)
console.log('')
console.log('私钥:')
console.log(privateKeyPem)
console.log('')

// 2. 使用 invite code 获取 device token
console.log('=== 步骤 2: 获取 Device Token ===')
console.log('请使用以下 curl 命令获取 device token:')
console.log('')
console.log('curl -s "http://localhost:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=EZAJ8PLU74w5f4urzS8-vHWLJSeoJRbS_9Y8kpZGctE"')
console.log('')
console.log('或者访问：http://localhost:18789/plugins/node-auto-register/?inviteCode=EZAJ8PLU74w5f4urzS8-vHWLJSeoJRbS_9Y8kpZGctE')
console.log('')
console.log('获取到 token 后，将公钥注册到 Gateway，然后运行下一步测试')
console.log('')

// 3. 等待用户输入 token 和 deviceId
import * as readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

rl.question('请输入 Device ID: ', (deviceId) => {
  rl.question('请输入 Device Token: ', (deviceToken) => {
    rl.close()

    console.log('')
    console.log('=== 步骤 3: 测试 WebSocket 认证 ===')
    console.log(`Device ID: ${deviceId}`)
    console.log(`Device Token: ${deviceToken.slice(0, 10)}...`)
    console.log('')

    testAuth(deviceId, deviceToken, publicKeyPem, privateKeyPem)
  })
})

async function testAuth(deviceId, deviceToken, publicKeyPem, privateKeyPem) {
  const ws = new WebSocket('ws://localhost:18789/')

  let connectNonce = null

  ws.on('open', () => {
    console.log('WebSocket 已连接')
  })

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())

    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      connectNonce = msg.payload.nonce
      console.log('收到 connect.challenge')
      console.log(`Nonce: ${connectNonce}`)
      console.log('')

      // 构建 V3 载荷并签名
      const now = Date.now()
      const payloadStr = [
        'v3',
        deviceId,
        'node-host',
        'node',
        'node',
        '',
        String(now),
        deviceToken,
        connectNonce,
        'node',
        'nodejs',
      ].join('|')

      console.log('Payload:')
      console.log(payloadStr)
      console.log('')

      const sig = sign(null, Buffer.from(payloadStr, 'utf8'), createPrivateKey(privateKeyPem))
      const signature = sig.toString('base64url')

      console.log('Signature:')
      console.log(signature)
      console.log('')

      // 发送 connect 请求
      const connectMsg = {
        type: 'req',
        id: `connect-${now}`,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'node-host',
            displayName: 'Test-Node',
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
            nonce: connectNonce,
          },
          auth: {
            deviceToken: deviceToken,
          },
          role: 'node',
          scopes: [],
        },
      }

      console.log('发送 connect 请求...')
      ws.send(JSON.stringify(connectMsg))
    }

    if (msg.type === 'res' && msg.ok) {
      console.log('')
      console.log('✓ 认证成功!')
      console.log('')
      console.log('响应:', JSON.stringify(msg.payload, null, 2))
      ws.close()
      process.exit(0)
    }

    if (msg.type === 'res' && !msg.ok) {
      console.log('')
      console.log('✗ 认证失败:', JSON.stringify(msg.error, null, 2))
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
}
