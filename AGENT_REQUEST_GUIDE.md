# WebSocket Agent Request 使用指南

## 概述

通过 WebSocket 连接到 Gateway，使用 `node.event` 方法调用 `agent.request` 事件，可以让 Node 节点触发 AI Agent 处理消息，并将结果推送到指定渠道（如飞书、Discord 等）。

## 帧格式

### 1. 连接请求

```json
{
  "type": "req",
  "id": "connect-1711532000000",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "node-host",
      "displayName": "my-node",
      "version": "1.0.0",
      "platform": "node",
      "mode": "node",
      "deviceFamily": "nodejs"
    },
    "device": {
      "id": "device-id-xxx",
      "publicKey": "base64url-public-key",
      "signature": "base64url-signature",
      "signedAt": 1711532000000,
      "nonce": "server-provided-nonce"
    },
    "auth": {
      "deviceToken": "your-device-token"
    },
    "role": "node",
    "scopes": []
  }
}
```

### 2. Agent Request 事件

```json
{
  "type": "req",
  "id": "agent-req-xxx",
  "method": "node.event",
  "params": {
    "event": "agent.request",
    "payloadJSON": "{\"message\":\"测试消息\",\"sessionKey\":\"agent:main:feishu:direct:manager\",\"deliver\":true,\"channel\":\"feishu\",\"to\":\"ou_xxx\"}"
  }
}
```

## 使用方式

### 方式一：使用测试脚本

```bash
# 使用原始 WebSocket 测试
node test/test-agent-request.js

# 使用 WebSocketSender 类测试
node test/test-ws-sender-agent.js
```

### 方式二：使用 WebSocketSender 类

```javascript
import { WebSocketSender } from './modules/websocket-sender.js'

const sender = new WebSocketSender({
  gatewayHost: 'localhost',
  gatewayPort: 18789,
  deviceToken: 'your-device-token',
  deviceId: 'your-device-id',
  privateKey: device.privateKeyPem,
  publicKey: device.publicKeyPem,
  displayName: 'My Node',
})

// 连接
await sender.connect()

// 发送 agent 请求
const result = await sender.sendAgentRequest('你好，请帮我查询天气', {
  sessionKey: 'agent:main:feishu:direct:manager',
  channel: 'feishu',
  to: 'ou_xxxxx',
  deliver: true,
  receipt: true,
  receiptText: '已收到，正在处理...',
})

// 断开连接
sender.disconnect()
```

## payloadJSON 参数说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 发送给 Agent 的消息内容 |
| `sessionKey` | string | 否 | 会话标识，默认 `node-{deviceId}` |
| `deliver` | boolean | 否 | 是否推送回复到渠道，默认 `false` |
| `channel` | string | 否 | 目标渠道（如 `feishu`） |
| `to` | string | 否 | 目标用户 ID（如飞书 open_id） |
| `receipt` | boolean | 否 | 是否发送"已收到"回执 |
| `receiptText` | string | 否 | 回执文本内容 |
| `thinking` | string | 否 | 思考级别：`low` \| `medium` \| `high` |
| `timeoutSeconds` | number | 否 | Agent 超时时间（秒） |

## 支持的渠道

- `feishu` - 飞书
- `discord` - Discord
- `telegram` - Telegram
- `whatsapp` - WhatsApp
- `slack` - Slack
- 其他 Gateway 已配置的渠道

## 会话 Key 说明

会话 Key 格式：`agent:{agentId}:{channel}:{type}:{id}`

例如：
- `agent:main:feishu:direct:manager` - 主 Agent + 飞书 + 单聊 + manager 账号
- `agent:main:feishu:group:oc_xxx` - 主 Agent + 飞书 + 群聊 + 群 ID

## 注意事项

1. **设备认证**：必须先通过 `connect` 请求完成设备认证
2. **SessionKey**：建议使用已存在的会话 Key，避免创建新会话
3. **deliver 参数**：设置为 `true` 才会推送回复到渠道
4. **超时处理**：建议设置合理的 `timeoutSeconds`（默认 30 秒）

## 完整示例

```javascript
import { readFileSync } from 'fs'
import { join } from 'path'
import { WebSocketSender } from './dist/modules/websocket-sender.js'

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

async function notify(message, options = {}) {
  await sender.connect()

  const result = await sender.sendAgentRequest(message, {
    sessionKey: options.sessionKey || 'agent:main:feishu:direct:manager',
    channel: options.channel || 'feishu',
    to: options.to,
    deliver: true,
    receipt: options.receipt ?? false,
  })

  sender.disconnect()
  return result
}

// 使用示例
notify('任务执行完成！', {
  receipt: true,
  receiptText: '任务已完成',
})
```

## 参考资料

- [node-gateway-authentication.md](./node-gateway-authentication.md) - Node 与 Gateway 认证机制
- [test-agent-request.js](./test/test-agent-request.js) - 原始 WebSocket 测试脚本
- [test-ws-sender-agent.js](./test/test-ws-sender-agent.js) - WebSocketSender 类测试脚本
