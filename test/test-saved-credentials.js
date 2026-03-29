#!/usr/bin/env node

/**
 * 使用已保存的凭证测试 Gateway WebSocket 消息发送
 */

import { WebSocketSender } from '../dist/modules/websocket-sender.js'
import { readFileSync } from 'fs'
import { join } from 'path'

// 读取已保存的凭证
const homeDir = process.env.HOME || process.env.USERPROFILE
const deviceAuth = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device-auth.json'), 'utf-8'))
const device = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device.json'), 'utf-8'))
const nodeConfig = JSON.parse(readFileSync(join(homeDir, '.openclaw/node.json'), 'utf-8'))

const deviceToken = deviceAuth.tokens.node.token
const deviceId = deviceAuth.deviceId
const privateKey = device.privateKeyPem  // PEM 格式
const publicKey = device.publicKeyPem    // PEM 格式

console.log('====================================')
console.log('  Gateway WebSocket 消息发送测试')
console.log('====================================')
console.log('')
console.log(`Gateway: ${nodeConfig.gateway.host}:${nodeConfig.gateway.port}`)
console.log(`Node: ${nodeConfig.displayName}`)
console.log(`Device ID: ${deviceId.slice(0, 16)}...`)
console.log('')

async function test() {
  const sender = new WebSocketSender({
    gatewayHost: nodeConfig.gateway.host,
    gatewayPort: nodeConfig.gateway.port,
    deviceToken,
    deviceId,
    privateKey,
    publicKey,
  })

  try {
    console.log('正在连接 Gateway...')
    await sender.connect()
    console.log('✓ 连接成功')
    console.log('')

    const message = `🔍 ClawNode 测试消息

时间：${new Date().toLocaleString('zh-CN')}
Node: ${nodeConfig.displayName}

如果收到此消息，说明 WebSocket 配置正常！`

    console.log('正在发送消息到飞书...')
    const result = await sender.sendMessage(
      'ou_f83886ae0d75c6b709967d289d6a46e3',
      message,
      {
        channel: 'feishu',
        accountId: 'manager',
        timeout: 15000,
      }
    )

    console.log('✓ 消息发送成功')
    console.log('')
    console.log('结果:')
    console.log(`  Message ID: ${result.messageId}`)
    console.log(`  Channel: ${result.channel}`)
    console.log(`  To JID: ${result.toJid}`)
    console.log('')

    sender.disconnect()
    console.log('✓ 测试完成')
    process.exit(0)
  } catch (error) {
    console.log('✗ 测试失败:', error.message)
    console.log('')
    sender.disconnect()
    process.exit(1)
  }
}

test()
