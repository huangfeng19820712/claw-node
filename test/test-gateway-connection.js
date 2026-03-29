#!/usr/bin/env node

/**
 * Gateway WebSocket 连通性测试
 *
 * 用法: node test/test-gateway-connection.js
 */

import WebSocket from 'ws'

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:18789'

console.log('====================================')
console.log('  Gateway WebSocket 连通性测试')
console.log('====================================')
console.log('')
console.log(`目标：${GATEWAY_URL}`)
console.log('')

// 创建 WebSocket 连接
const ws = new WebSocket(GATEWAY_URL)

const timeout = setTimeout(() => {
  console.log('✗ 连接超时 (10 秒)')
  console.log('')
  console.log('可能的问题:')
  console.log('  1. Gateway 未启动')
  console.log('  2. 防火墙阻止连接')
  console.log('  3. 端口号错误')
  process.exit(1)
}, 10000)

ws.on('open', () => {
  clearTimeout(timeout)
  console.log('✓ WebSocket 连接成功!')
  console.log('')
  console.log('等待服务器发送 connect.challenge...')
})

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString())
    console.log('')
    console.log('收到服务器消息:')
    console.log(JSON.stringify(msg, null, 2))

    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      console.log('')
      console.log('✓ 收到 connect.challenge，Gateway 响应正常!')
      console.log('')
      console.log('连通性测试通过！')
      console.log('')
      console.log('下一步:')
      console.log('  1. 运行 npx clawnode ws-generate-keys 生成密钥')
      console.log('  2. 在 Gateway 上获取设备 token')
      console.log('  3. 运行 npx clawnode ws-send 发送测试消息')
      ws.close()
      process.exit(0)
    }
  } catch (err) {
    console.log('收到原始数据:', data.toString())
  }
})

ws.on('error', (err) => {
  clearTimeout(timeout)
  console.log('')
  console.log('✗ 连接失败:', err.message)
  console.log('')
  console.log('可能的问题:')
  console.log('  1. Gateway 未启动')
  console.log('  2. 防火墙阻止连接')
  console.log('  3. 端口号错误')
  console.log('')
  console.log('检查 Gateway 状态:')
  console.log('  docker ps | grep openclaw')
  console.log('  curl http://localhost:18789/health')
  ws.close()
  process.exit(1)
})

ws.on('close', (code) => {
  console.log(`连接已关闭，代码：${code}`)
})
