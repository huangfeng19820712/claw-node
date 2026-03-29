#!/usr/bin/env node

/**
 * Gateway 完整认证和消息发送测试
 *
 * 用法：node test/test-gateway-auth.js
 *
 * 配置方式：
 * 1. 在 Gateway 上生成邀请码
 * 2. 通过 one-shot-pair API 获取 deviceToken 和 deviceId
 * 3. 运行此脚本
 */

import { WebSocketSender } from '../dist/modules/websocket-sender.js'

// 配置 - 从环境变量或命令行参数获取
const CONFIG = {
  gatewayHost: process.env.GATEWAY_HOST || process.argv[2] || 'localhost',
  gatewayPort: parseInt(process.env.GATEWAY_PORT || process.argv[3] || '18789'),
  deviceToken: process.env.DEVICE_TOKEN || process.argv[4] || '',
  deviceId: process.env.DEVICE_ID || process.argv[5] || '',
  privateKey: process.env.PRIVATE_KEY || process.argv[6] || '',
  publicKey: process.env.PUBLIC_KEY || process.argv[7] || '',
}

console.log('====================================')
console.log('  Gateway 认证和消息发送测试')
console.log('====================================')
console.log('')
console.log('配置信息:')
console.log(`  Gateway: ws://${CONFIG.gatewayHost}:${CONFIG.gatewayPort}`)
console.log(`  Device ID: ${CONFIG.deviceId || '(未配置)'}`)
console.log(`  Device Token: ${CONFIG.deviceToken ? '***' + CONFIG.deviceToken.slice(-8) : '(未配置)'}`)
console.log('')

// 检查配置
if (!CONFIG.deviceToken || !CONFIG.deviceId || !CONFIG.privateKey || !CONFIG.publicKey) {
  console.log('✗ 配置不完整，需要以下参数:')
  console.log('')
  console.log('  方式 1：通过环境变量')
  console.log('    export DEVICE_TOKEN=xxx')
  console.log('    export DEVICE_ID=xxx')
  console.log('    export PRIVATE_KEY=xxx')
  console.log('    export PUBLIC_KEY=xxx')
  console.log('')
  console.log('  方式 2：通过命令行参数')
  console.log('    node test-gateway-auth.js <host> <port> <token> <deviceId> <privateKey> <publicKey>')
  console.log('')
  console.log('获取认证信息的步骤:')
  console.log('  1. 在 Gateway 上生成邀请码:')
  console.log('     node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js my-node')
  console.log('  2. 获取设备 token:')
  console.log('     curl "http://localhost:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx"')
  console.log('  3. 生成密钥对:')
  console.log('     npx clawnode ws-generate-keys')
  console.log('')
  process.exit(1)
}

async function test() {
  const sender = new WebSocketSender(CONFIG)

  try {
    console.log('步骤 1/3: 连接到 Gateway...')
    await sender.connect()
    console.log('✓ 连接成功')
    console.log('')

    console.log('步骤 2/3: 发送测试消息...')
    const to = '+8613800138000'  // 测试目标
    const message = `🔍 ClawNode WebSocket 测试

时间：${new Date().toLocaleString('zh-CN')}
测试内容：验证 Gateway 认证和消息发送功能`

    const result = await sender.sendMessage(to, message, {
      channel: 'whatsapp',
      timeout: 10000,
    })

    console.log('✓ 消息发送成功')
    console.log('')
    console.log('步骤 3/3: 结果详情:')
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
    console.log('可能的原因:')
    console.log('  1. 设备 token 无效或过期')
    console.log('  2. 设备签名不匹配')
    console.log('  3. 目标渠道未配置')
    console.log('')
    sender.disconnect()
    process.exit(1)
  }
}

test()
