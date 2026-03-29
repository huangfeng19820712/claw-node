# WebSocket Send 使用指南

## 概述

ClawNode 集成了通过 WebSocket call 帧直接向 OpenClaw Gateway 发送消息的功能，无需修改 OpenClaw 源码，支持所有 Gateway 配置的渠道（WhatsApp、Telegram、Discord、Slack 等）。

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│  ClawNode                                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  WebSocketSender                                 │    │
│  │  1. 连接到 ws://gateway:18789                    │    │
│  │  2. 等待 connect.challenge                       │    │
│  │  3. 发送 connect 请求（带 ED25519 签名）            │    │
│  │  4. 认证成功后发送 call 帧调用 send 方法            │    │
│  └─────────────────────────────────────────────────┘    │
│                            │                             │
│                            │ WebSocket                   │
│                            ▼                             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  OpenClaw Gateway (18789)                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  - 验证设备签名 (ED25519)                         │    │
│  │  - 验证 device token                              │    │
│  │  - 调用渠道插件发送消息                           │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 步骤 1：生成密钥对

```bash
npx clawnode ws-generate-keys
```

输出：
```
ED25519 Key Pair Generated:
====================================
PUBLIC_KEY=9xK3jF2mN5pQ7rS8tU0vW1xY2zA3bC4dE5fG6hH7iJ8k=
------------------------------------
PRIVATE_KEY=2aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV3wX4yZ5z=
====================================
```

### 步骤 2：获取设备 Token

在 Gateway 服务器上执行：

```bash
# 1. 生成邀请码
docker exec -it openclaw-container bash
node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js my-node

# 输出：
# Invite Code: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 2. 获取设备 token
curl "http://localhost:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx"
```

响应：
```json
{
  "ok": true,
  "deviceToken": "device-token-xxx",
  "deviceId": "device-id-xxx",
  "role": "node"
}
```

### 步骤 3：配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
# WebSocket 发送器配置
GATEWAY_HOST=192.168.1.100
GATEWAY_PORT=18789
DEVICE_TOKEN=your-device-token
DEVICE_ID=your-device-id
PRIVATE_KEY=your-base64url-private-key
PUBLIC_KEY=your-base64url-public-key
```

### 步骤 4：发送消息

```bash
# 使用 CLI 发送
npx clawnode ws-send \
  --to "+8613800138000" \
  --message "Hello from ClawNode!" \
  --channel whatsapp
```

## CLI 命令

### ws-send

通过 WebSocket call 帧发送消息到渠道。

```bash
npx clawnode ws-send \
  --to <target> \
  --message <text> \
  [--channel <channel>] \
  [--gateway <host>] \
  [--port <port>] \
  [--device-token <token>] \
  [--device-id <id>] \
  [--private-key <key>] \
  [--public-key <key>]
```

#### 参数说明

| 参数 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `--to` | 目标地址（号码、用户名、频道 ID） | - | 是 |
| `--message` | 消息内容 | - | 是 |
| `--channel` | 渠道名称 | `whatsapp` | 否 |
| `--gateway` | Gateway 主机 | `localhost` | 否 |
| `--port` | Gateway 端口 | `18789` | 否 |
| `--device-token` | 设备 Token | 环境变量 | 是* |
| `--device-id` | 设备 ID | 环境变量 | 是* |
| `--private-key` | 私钥 (base64url) | 环境变量 | 是* |
| `--public-key` | 公钥 (base64url) | 环境变量 | 是* |

*环境变量已配置时可省略

### ws-generate-keys

生成 ED25519 密钥对。

```bash
npx clawnode ws-generate-keys
```

## 支持的渠道

| 渠道 | channel 值 |
|------|-----------|
| WhatsApp | `whatsapp` |
| Telegram | `telegram` |
| Discord | `discord` |
| Slack | `slack` |
| Signal | `signal` |
| iMessage | `imessage` |
| LINE | `line` |
| 飞书 | `feishu` |
| 钉钉 | `dingtalk` |
| 企业微信 | `wecom` |

## 编程接口

### 使用示例

```typescript
import { WebSocketSender } from './modules/websocket-sender'

// 创建发送器
const sender = new WebSocketSender({
  gatewayHost: '192.168.1.100',
  gatewayPort: 18789,
  deviceToken: 'your-device-token',
  deviceId: 'your-device-id',
  privateKey: 'your-base64url-private-key',
  publicKey: 'your-base64url-public-key',
})

// 连接并发送消息
try {
  await sender.connect()

  const result = await sender.sendMessage(
    '+8613800138000',
    'Hello from ClawNode!',
    { channel: 'whatsapp' }
  )

  console.log('Message sent:', result)
  // {
  //   messageId: 'BAE5F4C8D9E0A1B2C3D4',
  //   channel: 'whatsapp',
  //   toJid: '8613800138000@s.whatsapp.net'
  // }

  sender.disconnect()
} catch (error) {
  console.error('Send failed:', error)
  sender.disconnect()
}
```

### 事件监听

```typescript
sender.on('connected', () => {
  console.log('Connected to Gateway')
})

sender.on('message', (msg) => {
  console.log('Received message:', msg)
})
```

## 使用场景

### 场景 1：任务完成通知

结合 ClawNode 执行任务后发送通知：

```bash
# 执行任务并发送通知
npx clawnode run "创建一个新的 Express 项目"

# 任务完成后，通过 WebSocket 发送详细通知
npx clawnode ws-send \
  --to "@team-group" \
  --message "✅ 任务完成：Express 项目创建成功
📋 项目结构：
- package.json
- src/index.js
- src/routes/
- src/middleware/" \
  --channel telegram
```

### 场景 2：批量发送

```typescript
import { WebSocketSender } from './modules/websocket-sender'

const sender = new WebSocketSender({ /* 配置 */ })
await sender.connect()

const recipients = [
  { to: '+8613800138000', message: 'Message 1' },
  { to: '+8613800138001', message: 'Message 2' },
  { to: '+8613800138002', message: 'Message 3' },
]

for (const recipient of recipients) {
  try {
    await sender.sendMessage(recipient.to, recipient.message, {
      channel: 'whatsapp',
      idempotencyKey: `batch-${recipient.to}-${Date.now()}`,
    })
    console.log(`Sent to ${recipient.to}`)
  } catch (error) {
    console.error(`Failed to send to ${recipient.to}`, error)
  }
}

sender.disconnect()
```

### 场景 3：定时通知

```typescript
import { WebSocketSender } from './modules/websocket-sender'

const sender = new WebSocketSender({ /* 配置 */ })

// 每天早上 9 点发送日报通知
async function sendDailyReport() {
  await sender.connect()

  await sender.sendMessage(
    '@team-group',
    `📊 日报 - ${new Date().toLocaleDateString()}

今日完成:
- 功能 A 开发完成
- Bug 修复 3 个
- 代码审查 2 次

明日计划:
- 功能 B 开发
- 性能优化`,
    { channel: 'telegram' }
  )

  sender.disconnect()
}
```

## 故障排除

### 认证失败 "device signature invalid"

检查私钥格式是否正确，需要是 base64url 编码的原始字节：

```bash
# 如果是 PEM 格式，需要转换
node -e "
const { readFileSync } = require('fs')
const pem = readFileSync('private.pem', 'utf8')
const base64 = pem.replace(/-----.*?-----/g, '').replace(/\s/g, '')
const buf = Buffer.from(base64, 'base64')
console.log('PRIVATE_KEY=', buf.subarray(16).toString('base64url'))
"
```

### 连接被拒绝 "origin not allowed"

在 Gateway 配置中允许跨域：

```yaml
# Gateway 配置
gateway:
  controlUi:
    allowedOrigins:
      - "*"  # 或指定 IP
```

### 消息发送失败 "channel not configured"

确保 Gateway 已配置对应渠道的账号：

```bash
openclaw channels status
```

### 幂等键冲突

确保每次发送使用唯一的 `idempotencyKey`：

```typescript
await sender.sendMessage(to, message, {
  channel: 'whatsapp',
  idempotencyKey: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
})
```

## 高级用法

### 发送带媒体的消息

```typescript
const result = await sender.sendMessage(to, 'Check this photo', {
  channel: 'whatsapp',
  // 注意：媒体消息需要 Gateway 支持媒体上传
  // 可能需要额外的参数配置
})
```

### 发送投票（Telegram）

```typescript
// 需要 Gateway 支持 poll 方法
const pollCall = {
  type: 'call',
  payload: {
    callId: 'poll-' + Date.now(),
    name: 'poll',
    params: {
      to: '@channel',
      question: 'Favorite food?',
      options: ['Pizza', 'Sushi', 'Burger'],
      channel: 'telegram',
      idempotencyKey: 'poll-' + Date.now(),
    },
  },
}
ws.send(JSON.stringify(pollCall))
```

## 相关文档

- [WEBSOCKET-SEND-IMPLEMENTATION.md](WEBSOCKET-SEND-IMPLEMENTATION.md) - 完整实现指南
- [CLI_USAGE.md](CLI_USAGE.md) - CLI 使用指南
- [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) - Session 管理
