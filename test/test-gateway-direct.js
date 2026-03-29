#!/usr/bin/env node

/**
 * 直接测试 Gateway WebSocket 发送消息
 * 使用已注册的 Node 配置
 *
 * 用法：node test/test-gateway-direct.js <device-token> <private-key> <public-key> [target]
 */

import { WebSocketSender } from '../dist/modules/websocket-sender.js'
import { readFileSync } from 'fs'
import { join } from 'path'

// 读取已保存的 Node 配置
const nodeConfigPath = join(process.env.HOME || process.env.USERPROFILE, '.openclaw/node.json')
const nodeConfig = JSON.parse(readFileSync(nodeConfigPath, 'utf-8'))

const args = process.argv.slice(2)
const deviceToken = process.env.DEVICE_TOKEN || args[0]
const privateKey = process.env.PRIVATE_KEY || args[1]
const publicKey = process.env.PUBLIC_KEY || args[2]
const target = args[3] || 'ou_f83886ae0d75c6b709967d289d6a46e3'

console.log('====================================')
console.log('  Gateway WebSocket 消息发送测试')
console.log('====================================')
console.log('')
console.log(`Gateway: ${nodeConfig.gateway.host}:${nodeConfig.gateway.port}`)
console.log(`Node ID: ${nodeConfig.nodeId}`)
console.log('')

if (!deviceToken || !privateKey || !publicKey) {
  console.log('请提供设备凭证:')
  console.log('')
  console.log('用法：node test-gateway-direct.js <device-token> <private-key> <public-key> [target]')
  console.log('')
  console.log('或者设置环境变量:')
  console.log('  export DEVICE_TOKEN=xxx')
  console.log('  export PRIVATE_KEY=xxx')
  console.log('  export PUBLIC_KEY=xxx')
  console.log('')
  console.log('提示：运行 npx clawnode ws-generate-keys 生成密钥对')
  console.log('')
  process.exit(1)
}

async function test() {
  const sender = new WebSocketSender({
    gatewayHost: nodeConfig.gateway.host,
    gatewayPort: nodeConfig.gateway.port,
    deviceToken,
    deviceId: nodeConfig.nodeId,
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

    console.log(`发送消息到飞书：${target}`)
    console.log('消息内容:')
    console.log(message)
    console.log('')

    // 注意：这里使用 feishu 渠道，需要传递 accountId 参数
    const result = await sender.sendMessage(target, message, {
      channel: 'feishu',
      accountId: 'manager',
      timeout: 15000,
    })

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
