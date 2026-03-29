#!/usr/bin/env node

/**
 * 使用已注册的 Node 配置测试 Gateway 消息发送
 *
 * 用法：node test/test-with-saved-config.js
 */

import { WebSocketSender } from '../dist/modules/websocket-sender.js'
import { readFileSync } from 'fs'
import { join } from 'path'

// 读取已保存的 Node 配置
const nodeConfigPath = join(process.env.HOME || process.env.USERPROFILE, '.openclaw/node.json')
const nodeConfig = JSON.parse(readFileSync(nodeConfigPath, 'utf-8'))

console.log('====================================')
console.log('  使用已保存的 Node 配置测试 Gateway')
console.log('====================================')
console.log('')
console.log('Node 配置:')
console.log(`  Node ID: ${nodeConfig.nodeId}`)
console.log(`  Display: ${nodeConfig.displayName}`)
console.log(`  Gateway: ${nodeConfig.gateway.host}:${nodeConfig.gateway.port}`)
console.log('')

// 从环境变量获取设备凭证（已注册后应该已配置）
const deviceToken = process.env.DEVICE_TOKEN
const deviceId = process.env.DEVICE_ID || nodeConfig.nodeId
const privateKey = process.env.PRIVATE_KEY
const publicKey = process.env.PUBLIC_KEY

console.log('设备凭证:')
console.log(`  Device ID: ${deviceId || '(未配置)'}`)
console.log(`  Device Token: ${deviceToken ? '***' + deviceToken.slice(-8) : '(未配置)'}`)
console.log(`  Private Key: ${privateKey ? '***' + privateKey.slice(-8) : '(未配置)'}`)
console.log(`  Public Key: ${publicKey ? '***' + publicKey.slice(-8) : '(未配置)'}`)
console.log('')

// 检查配置
if (!deviceToken || !privateKey || !publicKey) {
  console.log('需要在 .env 中配置以下环境变量:')
  console.log('')
  console.log('  DEVICE_TOKEN=<你的设备 token>')
  console.log('  PRIVATE_KEY=<你的私钥>')
  console.log('  PUBLIC_KEY=<你的公钥>')
  console.log('')
  console.log('或者运行：')
  console.log('  export DEVICE_TOKEN=xxx')
  console.log('  export PRIVATE_KEY=xxx')
  console.log('  export PUBLIC_KEY=xxx')
  console.log('')
  process.exit(1)
}

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
    console.log('正在连接到 Gateway...')
    await sender.connect()
    console.log('✓ 连接成功')
    console.log('')

    console.log('正在发送测试消息...')
    const result = await sender.sendMessage(
      '+8613800138000',
    `🔍 ClawNode WebSocket 测试

时间：${new Date().toLocaleString('zh-CN')}
Node: ${nodeConfig.displayName}`,
      { channel: 'whatsapp', timeout: 15000 }
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
