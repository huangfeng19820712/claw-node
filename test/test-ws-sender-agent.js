#!/usr/bin/env node

/**
 * 使用 WebSocketSender 类测试 agent.request 方式
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { WebSocketSender } from '../dist/modules/websocket-sender.js'

const homeDir = process.env.HOME || process.env.USERPROFILE

const deviceAuth = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device-auth.json'), 'utf-8'))
const device = JSON.parse(readFileSync(join(homeDir, '.openclaw/identity/device.json'), 'utf-8'))
const nodeConfig = JSON.parse(readFileSync(join(homeDir, '.openclaw/node.json'), 'utf-8'))

const sender = new WebSocketSender({
  gatewayHost: nodeConfig.gateway.host,
  gatewayPort: nodeConfig.gateway.port,
  deviceToken: deviceAuth.tokens.node.token,
  deviceId: deviceAuth.deviceId,
  privateKey: device.privateKeyPem,
  publicKey: device.publicKeyPem,
  displayName: nodeConfig.displayName,
})

console.log('====================================')
console.log('  测试 WebSocket Sender (agent.request)')
console.log('====================================')
console.log('')
console.log(`Gateway: ${nodeConfig.gateway.host}:${nodeConfig.gateway.port}`)
console.log(`Node: ${nodeConfig.displayName}`)
console.log('')

async function test() {
  try {
    console.log('正在连接 Gateway...')
    await sender.connect()
    console.log('✓ 连接成功')
    console.log('')

    console.log('正在发送测试消息到飞书...')
    const result = await sender.sendAgentRequest(
      `🔍 ClawNode WebSocket 测试

时间：${new Date().toLocaleString('zh-CN')}
Node: ${nodeConfig.displayName}

如果收到此消息，说明 WebSocket 配置正常！`,
      {
        sessionKey: 'agent:main:feishu:direct:manager',
        channel: 'feishu',
        to: 'ou_f83886ae0d75c6b709967d289d6a46e3',
        deliver: true,
        receipt: true,
        receiptText: '已收到测试消息',
      }
    )

    console.log('✓ 消息发送成功')
    console.log('')
    console.log('结果:', JSON.stringify(result, null, 2))
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
