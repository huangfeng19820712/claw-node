# Node 节点通过 WebSocket call 帧发送消息实现指南

## 概述

本指南说明如何在不修改 OpenClaw 源码的前提下，通过原生 WebSocket 协议直接向 Gateway 发送 `call` 帧来调用 `send` 方法，实现向渠道（WhatsApp、Telegram、Discord 等）发送消息。

---

## 架构原理

```
┌─────────────────────────────────────────────────────────────────┐
│  Node 节点                                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  WebSocket Client                                        │    │
│  │  1. 连接到 ws://gateway:18789                            │    │
│  │  2. 等待 connect.challenge                               │    │
│  │  3. 发送 connect 请求（带签名认证）                        │    │
│  │  4. 认证成功后发送 call 帧调用 send 方法                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            │ WebSocket                           │
│                            ▼                                     │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Gateway (18789)                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  ws-connection/message-handler.ts                        │    │
│  │  - 验证设备签名 (ED25519)                                 │    │
│  │  - 验证 device token                                      │    │
│  │  - 检查配对状态                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  server-methods/send.ts                                  │    │
│  │  - 解析 call 帧的 name: "send"                             │    │
│  │  - 验证参数 (to, message, channel, idempotencyKey)       │    │
│  │  - 调用 deliverOutboundPayloads                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  渠道插件 (WhatsApp/Telegram/Discord/Slack...)            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## WebSocket 协议帧格式

### 1. 连接请求帧 (connect)

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

### 2. 服务器挑战帧 (connect.challenge)

```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": {
    "nonce": "random-nonce-string"
  }
}
```

### 3. 连接成功响应帧 (hello-ok)

```json
{
  "type": "res",
  "id": "connect-1711532000000",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 3,
    "server": {
      "version": "2026.3.9",
      "connId": "conn-xxx"
    },
    "features": {
      "methods": ["send", "node.invoke", ...],
      "events": ["node.pair.requested", ...]
    },
    "auth": {
      "deviceToken": "your-rotated-device-token",
      "role": "node",
      "scopes": []
    }
  }
}
```

### 4. 调用请求帧 (call) - 发送消息

```json
{
  "type": "call",
  "payload": {
    "callId": "send-1711532000000",
    "name": "send",
    "params": {
      "to": "+8613800138000",
      "message": "Hello from node!",
      "channel": "whatsapp",
      "idempotencyKey": "msg-1711532000000-abc123"
    }
  }
}
```

### 5. 调用结果帧 (call.result)

```json
{
  "type": "call.result",
  "payload": {
    "callId": "send-1711532000000",
    "result": {
      "messageId": "BAE5F4C8D9E0A1B2C3D4",
      "channel": "whatsapp",
      "toJid": "8613800138000@s.whatsapp.net"
    }
  }
}
```

---

## 认证流程详解

### 步骤 1: 获取邀请码和设备 token

在 Gateway 服务器上生成邀请码：

```bash
# 进入 Gateway 容器或配置目录
docker exec -it openclaw-container bash

# 生成邀请码
node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js my-node
```

输出：
```
============================================================
OpenClaw Invite Code Generated
============================================================
Code Name:    my-node
Invite Code:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Expires:      2026-04-03T12:00:00.000Z
Max Uses:     1
============================================================
```

### 步骤 2: 通过 one-shot-pair API 获取设备 token

```bash
curl "http://gateway-host:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=YOUR_INVITE_CODE"
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

### 步骤 3: WebSocket 握手认证

1. 连接到 Gateway WebSocket 端点
2. 接收 `connect.challenge` 事件获取 nonce
3. 使用 ED25519 私钥签名载荷
4. 发送 `connect` 请求
5. 接收 `hello-ok` 响应完成认证

---

## 完整实现代码

### 方案 A: 独立 Node.js 客户端

创建文件 `node-sender.js`：

```javascript
#!/usr/bin/env node

/**
 * Node Sender - 通过 WebSocket call 帧发送消息到 OpenClaw 渠道
 *
 * 用法:
 *   node node-sender.js \
 *     --gateway localhost \
 *     --port 18789 \
 *     --device-token YOUR_TOKEN \
 *     --device-id YOUR_DEVICE_ID \
 *     --to +8613800138000 \
 *     --message "Hello" \
 *     --channel whatsapp
 */

import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============= 配置 =============
const CONFIG = {
  gatewayHost: process.env.GATEWAY_HOST || 'localhost',
  gatewayPort: parseInt(process.env.GATEWAY_PORT || '18789'),
  deviceToken: process.env.DEVICE_TOKEN,
  deviceId: process.env.DEVICE_ID,
  // ED25519 密钥对（用于签名认证）
  privateKey: process.env.PRIVATE_KEY, // base64url 格式的原始私钥字节
  publicKey: process.env.PUBLIC_KEY,   // base64url 格式的原始公钥字节
};

// ============= WebSocket 客户端 =============
class NodeSenderClient {
  constructor(options) {
    this.gatewayHost = options.gatewayHost || 'localhost';
    this.gatewayPort = options.gatewayPort || 18789;
    this.deviceToken = options.deviceToken;
    this.deviceId = options.deviceId;
    this.privateKey = options.privateKey;
    this.publicKey = options.publicKey;
    this.displayName = options.displayName || 'NodeSender';

    this.ws = null;
    this.connected = false;
    this.connectNonce = null;
    this.pendingCalls = new Map();
  }

  /**
   * 连接到 Gateway
   */
  connect() {
    const protocol = this.gatewayPort === 443 ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${this.gatewayHost}:${this.gatewayPort}/`;

    console.log('[NodeSender] Connecting to:', wsUrl);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('[NodeSender] WebSocket connected');
      this.connected = true;
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('error', (err) => {
      console.error('[NodeSender] WebSocket error:', err.message);
    });

    this.ws.on('close', (code, reason) => {
      console.log('[NodeSender] WebSocket closed:', code, reason?.toString());
      this.connected = false;
    });
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(message) {
    try {
      const msg = JSON.parse(message);

      // 处理 connect.challenge
      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        this.connectNonce = msg.payload?.nonce;
        console.log('[NodeSender] Received connect challenge');
        this.sendConnectRequest();
        return;
      }

      // 处理 connect 响应
      if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
        console.log('[NodeSender] Connected successfully');
        this.emit('connected');
        return;
      }

      // 处理 call.result
      if (msg.type === 'call.result') {
        const { callId, result } = msg.payload;
        const pending = this.pendingCalls.get(callId);
        if (pending) {
          this.pendingCalls.delete(callId);
          pending.resolve(result);
        }
        return;
      }

      // 处理错误响应
      if (msg.type === 'res' && !msg.ok) {
        console.error('[NodeSender] Error:', msg.error);
      }
    } catch (err) {
      console.error('[NodeSender] Parse error:', err.message);
    }
  }

  /**
   * 发送 connect 请求
   */
  sendConnectRequest() {
    if (!this.connectNonce) {
      console.error('[NodeSender] Cannot send connect without nonce');
      return;
    }

    const now = Date.now();
    const nonce = this.connectNonce;

    // 构建签名字载荷 (V3 格式)
    const payloadStr = this.buildDeviceAuthPayloadV3({
      deviceId: this.deviceId,
      clientId: 'node-host',
      clientMode: 'node',
      role: 'node',
      scopes: [],
      signedAtMs: now,
      token: this.deviceToken,
      nonce: nonce,
      platform: 'node',
      deviceFamily: 'nodejs',
    });

    // 签名
    const signature = this.signPayload(payloadStr);

    const connectMessage = {
      type: 'req',
      id: 'connect-' + Date.now(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'node-host',
          displayName: this.displayName,
          version: '1.0.0',
          platform: 'node',
          mode: 'node',
          deviceFamily: 'nodejs',
        },
        device: {
          id: this.deviceId,
          publicKey: this.publicKey,
          signature: signature,
          signedAt: now,
          nonce: nonce,
        },
        auth: {
          deviceToken: this.deviceToken,
        },
        role: 'node',
        scopes: [],
      },
    };

    console.log('[NodeSender] Sending connect request');
    this.ws.send(JSON.stringify(connectMessage));
  }

  /**
   * 构建 V3 设备认证载荷
   */
  buildDeviceAuthPayloadV3(params) {
    const scopes = params.scopes.join(',');
    const token = params.token || '';
    const platform = (params.platform || '').trim().toLowerCase();
    const deviceFamily = (params.deviceFamily || '').trim().toLowerCase();
    return [
      'v3',
      params.deviceId,
      params.clientId,
      params.clientMode,
      params.role,
      scopes,
      String(params.signedAtMs),
      token,
      params.nonce,
      platform,
      deviceFamily,
    ].join('|');
  }

  /**
   * 使用 ED25519 私钥签名载荷
   */
  signPayload(payload) {
    // 简化实现：如果私钥是 base64url 格式，需要转换为 PEM
    // 这里使用 crypto 模块进行签名
    const { createPrivateKey, sign } = await import('crypto');

    const privateKeyBytes = this.base64UrlDecode(this.privateKey);
    const privateKeyPem = this.privateKeyBytesToPem(privateKeyBytes);

    const sig = sign(null, Buffer.from(payload, 'utf8'), createPrivateKey(privateKeyPem));
    return this.base64UrlEncode(sig);
  }

  /**
   * Base64URL 解码
   */
  base64UrlDecode(input) {
    const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, 'base64');
  }

  /**
   * Base64URL 编码
   */
  base64UrlEncode(buf) {
    return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
  }

  /**
   * 私钥字节转 PEM
   */
  privateKeyBytesToPem(privateKeyBytes) {
    const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, privateKeyBytes]);
    const pem = pkcs8Der.toString('base64').match(/.{1,64}/g).join('\n');
    return '-----BEGIN PRIVATE KEY-----\n' + pem + '\n-----END PRIVATE KEY-----';
  }

  /**
   * 发送消息到渠道
   */
  async sendMessage(to, message, options = {}) {
    return new Promise((resolve, reject) => {
      const callId = `send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const callFrame = {
        type: 'call',
        payload: {
          callId,
          name: 'send',
          params: {
            to: to.trim(),
            message: message.trim(),
            channel: options.channel || 'whatsapp',
            accountId: options.accountId,
            idempotencyKey: options.idempotencyKey || callId,
          },
        },
      };

      const timeout = setTimeout(() => {
        this.pendingCalls.delete(callId);
        reject(new Error('send message timeout'));
      }, options.timeout || 30000);

      this.pendingCalls.set(callId, { resolve, reject, timeout });
      this.ws.send(JSON.stringify(callFrame));
    });
  }

  /**
   * 事件监听
   */
  on(event, callback) {
    if (!this._handlers) this._handlers = {};
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(callback);
  }

  emit(event, data) {
    if (!this._handlers || !this._handlers[event]) return;
    this._handlers[event].forEach(cb => cb(data));
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

// ============= CLI 入口 =============
async function main() {
  const args = process.argv.slice(2);
  const argMap = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      argMap[key] = value;
      i++;
    }
  }

  const client = new NodeSenderClient({
    gatewayHost: argMap.gateway || CONFIG.gatewayHost,
    gatewayPort: argMap.port || CONFIG.gatewayPort,
    deviceToken: argMap['device-token'] || CONFIG.deviceToken,
    deviceId: argMap['device-id'] || CONFIG.deviceId,
    privateKey: argMap['private-key'] || CONFIG.privateKey,
    publicKey: argMap['public-key'] || CONFIG.publicKey,
  });

  client.on('connected', async () => {
    try {
      const result = await client.sendMessage(
        argMap.to,
        argMap.message,
        {
          channel: argMap.channel || 'whatsapp',
          accountId: argMap['account-id'],
        }
      );
      console.log('[NodeSender] Message sent:', result);
      client.disconnect();
      process.exit(0);
    } catch (err) {
      console.error('[NodeSender] Send failed:', err.message);
      client.disconnect();
      process.exit(1);
    }
  });

  client.connect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

export default NodeSenderClient;
```

---

### 方案 B: 最小化实现（直接调用）

创建文件 `quick-send.js`：

```javascript
#!/usr/bin/env node

/**
 * 快速发送消息 - 最小化实现
 *
 * 用法:
 *   node quick-send.js "目标号码" "消息内容"
 */

import WebSocket from 'ws';
import { createPrivateKey, sign } from 'crypto';

// 配置 - 从环境变量或参数获取
const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:18789';
const DEVICE_TOKEN = process.env.DEVICE_TOKEN;
const DEVICE_ID = process.env.DEVICE_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY; // base64url 格式
const PUBLIC_KEY = process.env.PUBLIC_KEY;   // base64url 格式

const TO = process.argv[2];      // 目标号码
const MESSAGE = process.argv[3]; // 消息内容
const CHANNEL = process.argv[4] || 'whatsapp';

if (!TO || !MESSAGE || !DEVICE_TOKEN) {
  console.error('Usage: node quick-send.js <to> <message> [channel]');
  console.error('Environment variables required: DEVICE_TOKEN, DEVICE_ID, PRIVATE_KEY, PUBLIC_KEY');
  process.exit(1);
}

// Base64URL 工具
const base64UrlDecode = (input) => {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
};

const base64UrlEncode = (buf) => {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
};

const privateKeyBytesToPem = (privateKeyBytes) => {
  const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, privateKeyBytes]);
  const pem = pkcs8Der.toString('base64').match(/.{1,64}/g).join('\n');
  return '-----BEGIN PRIVATE KEY-----\n' + pem + '\n-----END PRIVATE KEY-----';
};

const buildDeviceAuthPayloadV3 = (params) => {
  return [
    'v3', params.deviceId, params.clientId, params.clientMode, params.role,
    params.scopes.join(','), String(params.signedAtMs), params.token || '',
    params.nonce, (params.platform || '').trim().toLowerCase(),
    (params.deviceFamily || '').trim().toLowerCase(),
  ].join('|');
};

// 创建 WebSocket 连接
const ws = new WebSocket(GATEWAY_URL);
let connectNonce = null;

ws.on('open', () => {
  console.log('Connected to Gateway');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  // 处理挑战
  if (msg.type === 'event' && msg.event === 'connect.challenge') {
    connectNonce = msg.payload?.nonce;
    console.log('Received challenge, sending connect...');

    // 构建签名
    const now = Date.now();
    const payloadStr = buildDeviceAuthPayloadV3({
      deviceId: DEVICE_ID,
      clientId: 'node-host',
      clientMode: 'node',
      role: 'node',
      scopes: [],
      signedAtMs: now,
      token: DEVICE_TOKEN,
      nonce: connectNonce,
      platform: 'node',
      deviceFamily: 'nodejs',
    });

    const privateKeyBytes = base64UrlDecode(PRIVATE_KEY);
    const privateKeyPem = privateKeyBytesToPem(privateKeyBytes);
    const signature = sign(null, Buffer.from(payloadStr, 'utf8'), createPrivateKey(privateKeyPem));

    // 发送 connect 请求
    ws.send(JSON.stringify({
      type: 'req',
      id: 'connect-' + now,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'node-host',
          displayName: 'QuickSender',
          version: '1.0.0',
          platform: 'node',
          mode: 'node',
          deviceFamily: 'nodejs',
        },
        device: {
          id: DEVICE_ID,
          publicKey: PUBLIC_KEY,
          signature: base64UrlEncode(signature),
          signedAt: now,
          nonce: connectNonce,
        },
        auth: { deviceToken: DEVICE_TOKEN },
        role: 'node',
        scopes: [],
      },
    }));
    return;
  }

  // 处理连接成功
  if (msg.type === 'res' && msg.ok && msg.payload?.type === 'hello-ok') {
    console.log('Authentication successful, sending message...');

    // 发送 call 帧
    const callId = 'send-' + Date.now();
    ws.send(JSON.stringify({
      type: 'call',
      payload: {
        callId,
        name: 'send',
        params: {
          to: TO,
          message: MESSAGE,
          channel: CHANNEL,
          idempotencyKey: callId,
        },
      },
    }));
    return;
  }

  // 处理结果
  if (msg.type === 'call.result') {
    console.log('Message sent successfully!');
    console.log('Result:', JSON.stringify(msg.payload.result, null, 2));
    ws.close();
    process.exit(0);
    return;
  }

  // 处理错误
  if (msg.type === 'res' && !msg.ok) {
    console.error('Error:', msg.error);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('Connection closed');
});
```

---

## 使用步骤

### 1. 准备认证信息

```bash
# 在 Gateway 上生成邀请码
docker exec -it openclaw-container bash
node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js my-node

# 获取设备 token
curl "http://localhost:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx"
```

### 2. 生成 ED25519 密钥对

```bash
# 使用 OpenSSL 生成
openssl genpkey -algorithm ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem

# 或使用 Node.js
node -e "
const { generateKeyPairSync } = require('crypto');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
console.log('PUBLIC_KEY=', publicKey.export({ type: 'spki', format: 'pem' }));
console.log('PRIVATE_KEY=', privateKey.export({ type: 'pkcs8', format: 'pem' }));
"
```

### 3. 运行发送脚本

```bash
# 设置环境变量
export GATEWAY_URL="ws://192.168.1.100:18789"
export DEVICE_TOKEN="your-device-token"
export DEVICE_ID="your-device-id"
export PRIVATE_KEY="base64url-private-key"
export PUBLIC_KEY="base64url-public-key"

# 发送消息
node quick-send.js "+8613800138000" "Hello from node!" whatsapp
```

---

## 支持的参数

| 参数 | 说明 | 必填 |
|------|------|------|
| `to` | 目标地址（号码、用户名、频道 ID） | 是 |
| `message` | 消息文本 | 是 |
| `channel` | 渠道名称 | 否 (默认 whatsapp) |
| `accountId` | 多账号渠道的账号 ID | 否 |
| `idempotencyKey` | 幂等键（防止重复发送） | 否 (自动生成) |

### 支持的渠道

- `whatsapp` - WhatsApp
- `telegram` - Telegram
- `discord` - Discord
- `slack` - Slack
- `signal` - Signal
- `imessage` - iMessage (macOS/iOS)
- `bluebubbles` - BlueBubbles
- `googlechat` - Google Chat
- `msteams` - Microsoft Teams
- `line` - LINE
- `feishu` - 飞书
- `zalo` - Zalo

---

## 常见问题

### 1. 认证失败 "device signature invalid"

检查私钥格式是否正确，需要是 base64url 编码的原始字节：

```javascript
// 从 PEM 转换为 base64url
const pemToBase64Url = (pem) => {
  const base64 = pem.replace(/-----.*?-----/g, '').replace(/\s/g, '');
  const buf = Buffer.from(base64, 'base64');
  return buf.toString('base64url');
};
```

### 2. 连接被拒绝 "origin not allowed"

如果是跨机器连接，需要在 Gateway 配置中允许：

```yaml
gateway:
  controlUi:
    allowedOrigins:
      - "*"  # 或指定 IP
```

### 3. 消息发送失败 "channel not configured"

确保 Gateway 已配置对应渠道的账号：

```bash
openclaw channels status
```

### 4. 幂等键冲突

确保每次发送使用唯一的 `idempotencyKey`，避免重复消息被拦截。

---

## 高级用法

### 发送带媒体的消息

```javascript
await client.sendMessage(to, 'Check this photo', {
  channel: 'whatsapp',
  mediaUrl: 'http://example.com/photo.jpg',
});
```

### 发送投票（Telegram）

```javascript
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
};
ws.send(JSON.stringify(pollCall));
```

### 批量发送

```javascript
const recipients = ['+8613800138000', '+8613800138001', '+8613800138002'];
const messages = ['Message 1', 'Message 2', 'Message 3'];

for (let i = 0; i < recipients.length; i++) {
  await client.sendMessage(recipients[i], messages[i], {
    channel: 'whatsapp',
    idempotencyKey: `batch-${i}-${Date.now()}`,
  });
}
```

---

## 参考资料

- Gateway WebSocket 协议：`src/gateway/server/ws-connection/message-handler.ts`
- Send 方法实现：`src/gateway/server-methods/send.ts`
- 设备认证：`src/gateway/device-auth.ts`
- 节点客户端示例：`plugins/node-auto-register/src/node-client.js`

---

## 总结

通过直接使用 WebSocket call 帧，可以：
- ✅ 无需修改 OpenClaw 源码
- ✅ 无需安装完整 OpenClaw（只需 Node.js + ws 依赖）
- ✅ 支持所有 Gateway 支持的渠道
- ✅ 完整的认证和安全机制

关键步骤：
1. 获取设备 token（通过邀请码 one-shot-pair API）
2. 生成 ED25519 密钥对用于签名
3. WebSocket 连接并处理 `connect.challenge`
4. 发送签名的 `connect` 请求完成认证
5. 发送 `call` 帧调用 `send` 方法
6. 接收 `call.result` 获取发送结果
