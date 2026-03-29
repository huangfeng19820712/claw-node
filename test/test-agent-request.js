#!/usr/bin/env node

/**
 * 测试使用 agent.request 方式发送消息
 * 通过 node.event 发送 agent.request 事件
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

console.log('====================================')
console.log('  测试 agent.request 方式发送消息')
console.log('====================================')
console.log('')

const ws = new WebSocket(`ws://${nodeConfig.gateway.host}:${nodeConfig.gateway.port}/`)

let resolveCallback = null
let rejectCallback = null

ws.on('open', () => {
  console.log('✓ WebSocket 已连接')
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())

  // 处理 connect.challenge
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    const nonce = msg.payload.nonce
    const now = Date.now()

    // V2 格式 - 空 scopes
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

    console.log('✓ 收到 challenge，发送 connect 请求')

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
    console.log('✓ 认证成功!')
    console.log('')

    // 认证成功后，发送 node.event 调用 agent.request
    console.log('正在发送 agent.request 事件...')

    const eventId = `agent-req-${Date.now()}`
    const message = `🔍 测试消息

时间：${new Date().toLocaleString('zh-CN')}
Node: ${nodeConfig.displayName}

如果收到此消息，说明 agent.request 配置正常！`

    // 构建 agent.request 事件
    const agentRequestPayload = {
      message: message,
      sessionKey: 'agent:main:feishu:direct:manager',
      deliver: true,
      channel: 'feishu',
      to: 'ou_f83886ae0d75c6b709967d289d6a46e3',
      receipt: true,
      receiptText: '已收到测试消息',
    }

    // 使用 node.event 发送
    const eventReq = {
      type: 'req',
      id: eventId,
      method: 'node.event',
      params: {
        event: 'agent.request',
        payloadJSON: JSON.stringify(agentRequestPayload),
      },
    }

    console.log('发送 node.event:')
    console.log(JSON.stringify(eventReq, null, 2))

    // 设置 Promise 回调
    const promise = new Promise((resolve, reject) => {
      resolveCallback = resolve
      rejectCallback = reject
    })

    ws.send(JSON.stringify(eventReq))

    // 等待响应
    promise.then((result) => {
      console.log('')
      console.log('====================================')
      console.log('  最终返回值:')
      console.log('====================================')
      console.log(JSON.stringify(result, null, 2))
      console.log('')
      ws.close()
      process.exit(0)
    }).catch((err) => {
      console.log('')
      console.log('====================================')
      console.log('  错误:')
      console.log('====================================')
      console.log(JSON.stringify(err, null, 2))
      console.log('')
      ws.close()
      process.exit(1)
    })

    return
  }

  // 处理 node.event 响应
  if (msg.type === 'res' && msg.id?.startsWith('agent-req-')) {
    console.log('')
    console.log('收到 node.event 响应:')
    if (msg.ok) {
      console.log('✓ agent.request 发送成功!')
      console.log('')
      console.log('响应 payload:', JSON.stringify(msg.payload, null, 2))
      console.log('')
      console.log('等待 Agent 处理结果...')
      resolveCallback({
        ok: true,
        eventId: msg.id,
        payload: msg.payload,
      })
    } else {
      console.log('✗ 发送失败:', JSON.stringify(msg.error, null, 2))
      rejectCallback({
        ok: false,
        error: msg.error,
      })
    }
    return
  }

  // 处理 Gateway 推送的事件（如 agent 回复）
  if (msg.type === 'event') {
    console.log('')
    console.log('收到 Gateway 事件:')
    console.log(`  event: ${msg.event}`)
    if (msg.payload) {
      console.log(`  payload: ${JSON.stringify(msg.payload, null, 2)}`)
    }
    console.log('')
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
  console.log('测试超时 (30 秒)')
  ws.close()
  process.exit(1)
}, 30000)
