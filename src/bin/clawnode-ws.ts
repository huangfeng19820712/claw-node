#!/usr/bin/env node

/**
 * ClawNode WebSocket Sender CLI
 *
 * 通过 WebSocket call 帧直接向 Gateway 发送消息
 *
 * 用法:
 *   npx clawnode ws-send --to "+8613800138000" --message "Hello" --channel whatsapp
 *   npx clawnode ws-generate-keys  # 生成密钥对
 */

import { WebSocketSender } from '../modules/websocket-sender.js'

// 解析命令行参数
function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const value = args[i + 1] || ''
      result[key] = value
      i++
    }
  }
  return result
}

// 生成密钥对命令
function generateKeys(): void {
  const { privateKey, publicKey } = WebSocketSender.generateKeyPair()
  console.log('ED25519 Key Pair Generated:')
  console.log('====================================')
  console.log(`PUBLIC_KEY=${publicKey}`)
  console.log('------------------------------------')
  console.log(`PRIVATE_KEY=${privateKey}`)
  console.log('====================================')
  console.log('')
  console.log('请将 PUBLIC_KEY 注册到 Gateway，并妥善保管 PRIVATE_KEY')
}

// 发送消息命令
async function sendMessage(args: Record<string, string>): Promise<void> {
  const {
    to,
    message,
    channel = 'whatsapp',
    gateway = 'localhost',
    port = '18789',
    'device-token': deviceToken = '',
    'device-id': deviceId = '',
    'private-key': privateKey = '',
    'public-key': publicKey = '',
  } = args

  if (!to || !message) {
    console.error('Error: --to and --message are required')
    console.error('')
    console.error('Usage:')
    console.error('  clawnode ws-send --to <number> --message <text> [options]')
    console.error('')
    console.error('Options:')
    console.error('  --channel       渠道名称 (默认：whatsapp)')
    console.error('  --gateway       Gateway 主机 (默认：localhost)')
    console.error('  --port          Gateway 端口 (默认：18789)')
    console.error('  --device-token  设备 Token (必填)')
    console.error('  --device-id     设备 ID (必填)')
    console.error('  --private-key   私钥 (必填)')
    console.error('  --public-key    公钥 (必填)')
    process.exit(1)
  }

  if (!deviceToken || !deviceId || !privateKey || !publicKey) {
    console.error('Error: device-token, device-id, private-key, and public-key are required')
    console.error('')
    console.error('获取认证信息的步骤:')
    console.error('  1. 在 Gateway 上生成邀请码')
    console.error('     node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js my-node')
    console.error('  2. 获取设备 token')
    console.error('     curl "http://gateway:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx"')
    console.error('  3. 生成 ED25519 密钥对')
    console.error('     clawnode ws-generate-keys')
    process.exit(1)
  }

  const sender = new WebSocketSender({
    gatewayHost: gateway,
    gatewayPort: parseInt(port),
    deviceToken,
    deviceId,
    privateKey,
    publicKey,
  })

  try {
    console.log(`[ClawNode] Connecting to ws://${gateway}:${port}...`)
    await sender.connect()
    console.log('[ClawNode] Connected successfully')

    console.log(`[ClawNode] Sending message to ${to} via ${channel}...`)
    const result = await sender.sendMessage(to, message, { channel })

    console.log('[ClawNode] Message sent successfully!')
    console.log('Result:')
    console.log(`  Message ID: ${result.messageId}`)
    console.log(`  Channel: ${result.channel}`)
    console.log(`  To JID: ${result.toJid}`)

    sender.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('[ClawNode] Send failed:', (error as Error).message)
    sender.disconnect()
    process.exit(1)
  }
}

// CLI 入口
const args = process.argv.slice(2)
const command = args[0]

switch (command) {
  case 'ws-send':
    sendMessage(parseArgs(args.slice(1)))
    break

  case 'ws-generate-keys':
    generateKeys()
    break

  case undefined:
    console.log('ClawNode WebSocket Sender')
    console.log('')
    console.log('Usage:')
    console.log('  clawnode ws-send --to <number> --message <text> [options]')
    console.log('  clawnode ws-generate-keys')
    console.log('')
    console.log('Commands:')
    console.log('  ws-send           发送消息到渠道')
    console.log('  ws-generate-keys  生成 ED25519 密钥对')
    break

  default:
    console.error(`Unknown command: ${command}`)
    console.error('Run without arguments to see usage')
    process.exit(1)
}

export {}
