# Node 与 Gateway 通信机制分析

## 概述

OpenClaw 中 Node 节点（如 macOS/iOS/Android 节点主机）与 Gateway（WebSocket 服务器）之间的通信采用**双重加密 + 设备身份签名**的安全架构，确保传输机密性、完整性和设备身份可信性。

---

## 1. 认证流程 (Authentication Flow)

### 1.1 连接握手时序

```
Node                     Gateway
  |                         |
  |----- WebSocket Connect ->|
  |                         |
  |<--- connect.challenge ---|
  |     { nonce, ts }        |
  |                         |
  |----- connect ------------>|
  |     { role: "node",      |
  |       device: {           |
  |         id,              |
  |         publicKey,       |
  |         signature,       |
  |         signedAt,       |
  |         nonce           |
  |       },                |
  |       auth: { token? }  |
  |     }                   |
  |                         |
  |<---- hello-ok -----------|
  |     { deviceToken,       |
  |       snapshot }         |
```

### 1.2 关键代码路径

| 步骤           | Gateway 侧代码                                                                                                                   | Node 侧代码                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Challenge 生成 | [ws-connection.ts#L144-148](file:///d:/nodews/openclaw-openclaw/src/gateway/server/ws-connection.ts#L144-L148)                   | -                                                                                                         |
| Connect 处理   | [message-handler.ts#L226-320](file:///d:/nodews/openclaw-openclaw/src/gateway/server/ws-connection/message-handler.ts#L226-L320) | [client.ts#L200-280](file:///d:/nodews/openclaw-openclaw/src/gateway/client.ts#L200-L280)                 |
| 签名验证       | [message-handler.ts#L505-518](file:///d:/nodews/openclaw-openclaw/src/gateway/server/ws-connection/message-handler.ts#L505-L518) | [device-identity.ts#L125-129](file:///d:/nodews/openclaw-openclaw/src/infra/device-identity.ts#L125-L129) |
| 配对检查       | [message-handler.ts#L614-670](file:///d:/nodews/openclaw-openclaw/src/gateway/server/ws-connection/message-handler.ts#L614-L670) | -                                                                                                         |
| Node 注册      | [node-registry.ts#L26-60](file:///d:/nodews/openclaw-openclaw/src/gateway/node-registry.ts#L26-L60)                              | -                                                                                                         |

---

## 2. 加密机制 (Encryption Mechanism)

### 2.1 传输层加密 (Transport Layer)

#### TLS 1.3

- **强制要求**: 所有非本地连接必须使用 `wss://`（WebSocket Secure）
- **最低版本**: TLSv1.3（在 [gateway.ts#L137](file:///d:/nodews/openclaw-openclaw/src/infra/tls/gateway.ts#L137) 强制指定）
- **证书来源**: 默认自动生成自签名证书（`~/.openclaw/gateway/tls/`）；生产环境建议配置真实证书
- **证书指纹固定 (Certificate Pinning)**: 客户端可通过 `--tls-fingerprint <sha256>` 指定期望的网关证书指纹，防止中间人攻击

```typescript
// client.ts 中的安全检查
if (!isSecureWebSocketUrl(url)) {
  throw new Error("SECURITY ERROR: Cannot connect to ... over plaintext ws://");
}
```

### 2.2 设备身份签名层 (Device Identity Signature Layer)

这是 OpenClaw 的**无密码认证（Passwordless Authentication）**核心机制。

#### 密钥生成

Node 首次启动时生成 **Ed25519 密钥对**：

```typescript
// device-identity.ts
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const deviceId = sha256(publicKeyRaw); // deviceId = 公钥的 SHA-256 哈希
```

| 属性     | 说明                                             |
| -------- | ------------------------------------------------ |
| 算法     | Ed25519（椭圆曲线签名）                          |
| 密钥用途 | 设备身份证明、消息签名                           |
| 设备 ID  | 公钥的 SHA-256 哈希                              |
| 存储位置 | `~/.openclaw/identity/device.json`（权限 0o600） |

#### DeviceAuthPayload 构造

签名负载由以下字段用 `|` 分隔拼接（[device-auth.ts#L12-25](file:///d:/nodews/openclaw-openclaw/src/gateway/device-auth.ts#L12-L25)）：

```
v2 | {deviceId} | {clientId} | {clientMode} | {role} | {scopes} | {signedAtMs} | {token} | {nonce}
```

| 字段         | 类型   | 说明                         |
| ------------ | ------ | ---------------------------- |
| `deviceId`   | string | 设备公钥的 SHA-256 哈希      |
| `clientId`   | string | 客户端名称（如 `node-host`） |
| `clientMode` | string | 客户端模式（固定为 `node`）  |
| `role`       | string | 角色（固定为 `node`）        |
| `scopes`     | string | 权限范围（逗号分隔）         |
| `signedAtMs` | number | 时间戳（毫秒）               |
| `token`      | string | 共享令牌（可选）             |
| `nonce`      | string | Gateway 颁发的随机挑战码     |

#### 签名与验签

**Node 侧签名**：

```typescript
// device-identity.ts
const signature = crypto.sign(null, Buffer.from(payload, "utf8"), privateKey);
```

**Gateway 侧验签**：

```typescript
// device-identity.ts
const ok = crypto.verify(
  null,
  Buffer.from(payload, "utf8"),
  publicKey,
  signature,
);
```

#### 安全机制

| 机制             | 目的               | 实现位置                                 |
| ---------------- | ------------------ | ---------------------------------------- |
| **Nonce 挑战**   | 防止重放攻击       | Gateway 生成 → Node 必须包含在签名中     |
| **时间戳检查**   | 防止签名被长期复用 | 2 分钟窗口（`DEVICE_SIGNATURE_SKEW_MS`） |
| **设备配对审批** | 防止未授权设备接入 | `device.pair.requested` 事件触发审批     |
| **文件权限保护** | 防止私钥泄露       | `chmod 0o600`                            |

---

## 3. 业务逻辑 (Business Logic)

### 3.1 Gateway 调用 Node（命令下发）

Gateway 通过 `node.invoke.request` 事件主动向 Node 发起命令调用：

```
Gateway                          Node
   |                               |
   |-- node.invoke.request ------->|
   |   { id, command, params }     |
   |                               |
   |                  [执行命令]     |
   |                               |
   |<-- node.invoke.result --------|
   |   { id, ok, payload/error }   |
```

**相关代码**：

| 组件     | 文件                                                                                                                                             | 说明                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 调用发起 | [node-registry.ts#L106-135](file:///d:/nodews/openclaw-openclaw/src/gateway/node-registry.ts#L106-L135)                                          | 生成 requestId，通过 WebSocket 发送事件 |
| 命令处理 | [invoke.ts#L416-510](file:///d:/nodews/openclaw-openclaw/src/node-host/invoke.ts#L416-L510)                                                      | 根据 command 类型分发处理               |
| 结果上报 | [nodes.handlers.invoke-result.ts#L26-65](file:///d:/nodews/openclaw-openclaw/src/gateway/server-methods/nodes.handlers.invoke-result.ts#L26-L65) | Node 返回执行结果                       |

**Node 支持的命令**：

| 命令                       | 说明               |
| -------------------------- | ------------------ |
| `system.run`               | 执行系统命令       |
| `system.which`             | 查找可执行文件路径 |
| `system.execApprovals.get` | 获取执行审批状态   |
| `system.execApprovals.set` | 设置执行审批规则   |
| `browser.proxy`            | 浏览器代理请求     |

### 3.2 Node 主动上报（事件推送）

Node 可在执行过程中主动发送事件给 Gateway，采用 **Request/Response** 模式中的 **Event** 帧：

```typescript
// Node 侧发送事件（Swift 示例）
try await channel.send(method: "node.event", params: [
    "event": "agent.request",
    "payloadJSON": payloadJsonString,
])
```

**所有支持的 Node 事件类型及 Payload 结构**（定义于 [server-node-events.ts](file:///d:/nodews/openclaw-openclaw/src/gateway/server-node-events.ts#L233-L545)）：

#### `agent.request` — Agent 请求事件（最常用）

Node 主动触发 AI Agent 处理消息，并将结果通过 `deliver` 标志决定是否推送回复。

> **关于 Bot 选择**：Agent 由 `sessionKey` 决定 — 每个会话已绑定特定 Agent 配置。`channel`/`to` 仅指定**回复投递目标**，不指定 Bot。

```typescript
{
  message: string;           // 用户输入的文本消息
  sessionKey?: string;      // 会话唯一标识，默认 `node-${nodeId}`
  thinking?: string;         // 思考级别: "low" | "medium" | "high"
  deliver?: boolean;        // 是否推送回复到 channel（默认 false）
  channel?: string;         // 目标渠道，如 "feishu"（默认取会话历史）
  to?: string;              // 目标用户 ID，如飞书 open_id
  receipt?: boolean;        // 是否发送"已收到"回执
  receiptText?: string;     // 回执文本
  timeoutSeconds?: number;  // Agent 超时时间（秒）
  attachments?: Array<{    // 附件列表
    type?: string;
    mimeType?: string;
    fileName?: string;
    content?: unknown;       // 图片 Base64 或文件路径
  }>;
  key?: string | null;     // 消息唯一键（用于去重）
}
```

**示例**：

```json
{
  "message": "帮我查询今天的天气",
  "sessionKey": "user-123-session",
  "deliver": true,
  "channel": "feishu",
  "to": "ou_xxxxx",
  "receipt": true,
  "receiptText": "收到，正在处理..."
}
```

#### `voice.transcript` — 语音转文字事件

设备麦克风采集语音并转为文字后触发 Agent 处理。

```typescript
{
  text: string;              // 语音识别后的文本
  sessionKey?: string;       // 会话标识（默认取主会话）
  eventId?: string;          // 事件唯一 ID（用于去重）
  providerEventId?: string;   // 第三方事件 ID
  transcriptId?: string;     // 转录记录 ID
  providerCallId?: string;   // 通话提供商标识
  callId?: string;           // 通话 ID
  sequence?: number;         // 序列号
  timestamp?: number;        // 事件时间戳
  ts?: number;              // 简写时间戳
  eventTimestamp?: number;    // 事件时间戳
}
```

**示例**：

```json
{
  "text": "打开客厅的灯",
  "sessionKey": "voice-session-001",
  "eventId": "evt-voice-123"
}
```

#### `exec.started` / `exec.finished` / `exec.denied` — 命令执行事件

Node 执行系统命令的状态通知。

```typescript
{
  sessionKey?: string;       // 会话标识
  runId?: string;           // 执行批次 ID
  command?: string;          // 执行的命令
  exitCode?: number;         // 退出码（exec.finished）
  timedOut?: boolean;         // 是否超时
  output?: string;           // 命令输出（截断至 180 字符）
  reason?: string;           // 拒绝原因（exec.denied）
}
```

**示例**：

```json
{
  "sessionKey": "node-ios-device",
  "runId": "run-456",
  "command": "open -a Safari",
  "exitCode": 0,
  "output": "Safari opened successfully"
}
```

#### `chat.subscribe` / `chat.unsubscribe` — 会话订阅

订阅或取消订阅指定会话的事件推送。

```typescript
{
  sessionKey: string; // 必填，要订阅的会话标识
}
```

**示例**：

```json
{ "sessionKey": "user-123-session" }
```

#### `push.apns.register` — APNs 推送 Token 注册

iOS 设备注册 APNs 推送 Token。

```typescript
{
  token: string;              // 设备 Push Token
  topic: string;             // App Bundle ID (如 ai.openclaw.ios)
  environment?: string;       // "sandbox" | "production"
}
```

**示例**：

```json
{
  "token": "abcd1234...",
  "topic": "ai.openclaw.ios",
  "environment": "production"
}
```

#### 3.2.1 Gateway 接收与处理流程

Gateway 在 `handleNodeEvent` 函数中统一处理所有 Node 上报的事件：

```typescript
export const handleNodeEvent = async (
  ctx: NodeEventContext,
  nodeId: string,
  evt: NodeEvent,
) => {
  switch (evt.event) {
    case "voice.transcript": {
      /* 语音处理逻辑 */
    }
    case "agent.request": {
      /* Agent 请求处理 */
    }
    case "exec.finished": {
      /* 执行完成通知 */
    }
    // ...
  }
};
```

**核心处理逻辑（以 `exec.finished` 为例）**：

```typescript
case "exec.finished": {
  // 1. 解析事件负载
  const obj = parsePayloadObject(evt.payloadJSON);
  const sessionKey = typeof obj.sessionKey === "string" ? obj.sessionKey.trim() : `node-${nodeId}`;
  const exitCode = obj.exitCode;
  const output = typeof obj.output === "string" ? obj.output.trim() : "";

  // 2. 构建通知文本
  let text = `Exec finished (node=${nodeId}), code ${exitCode}`;
  if (compactOutput) {
    text += `\n${compactOutput}`;
  }

  // 3. 入队系统事件
  enqueueSystemEvent(text, { sessionKey, contextKey: `exec:${runId}` });
  requestHeartbeatNow({ reason: "exec-event" });
}
```

---

### 3.3 Gateway 到飞书的消息推送

#### 3.3.1 完整消息流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           消息推送完整链路                               │
└─────────────────────────────────────────────────────────────────────────┘

  Node                        Gateway                       Feishu
    |                           |                             |
    |-- node.event ------------>|                             |
    |   event: "agent.request"  |                             |
    |   payload: {              |                             |
    |     message: "...",        |                             |
    |     sessionKey: "...",    |                             |
    |     channel: "feishu",    |                             |
    |     to: "user_open_id"    |                             |
    |   }                       |                             |
    |                           |-- handleNodeEvent() -------->|
    |                           |       evt.event ===         |
    |                           |       "agent.request"        |
    |                           |                             |
    |                           |-- agentCommand() ---------->|
    |                           |       运行 AI Agent         |
    |                           |                             |
    |                           |<-- AI 返回 Reply -----------|
    |                           |                             |
    |                           |-- deliverOutboundPayloads() |
    |                           |     channel: "feishu"     |
    |                           |     to: "user_open_id"     |
    |                           |                             |
    |                           |-- createChannelHandler()    |
    |                           |     加载飞书插件适配器     |
    |                           |                             |
    |                           |-- feishuOutbound.sendText()|
    |                           |                             |
    |                           |<-- HTTP API 调用 ----------|
    |                           |     飞书 IM API             |
    |                           |                             |
    |<-- WebSocket Event 回复 ---|                             |
```

#### 3.3.2 核心代码路径

| 步骤             | 文件                                                                                                                                                    | 说明                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Node 事件发送    | [GatewayNodeSession.swift#L236-246](file:///d:/nodews/openclaw-openclaw/apps/shared/OpenClawKit/Sources/OpenClawKit/GatewayNodeSession.swift#L236-L246) | Swift SDK 发送 `node.event`         |
| Gateway 事件入口 | [server-node-events.ts#L233](file:///d:/nodews/openclaw-openclaw/src/gateway/server-node-events.ts#L233)                                                | `handleNodeEvent` 统一入口          |
| Agent 执行       | [commands/agent.ts](file:///d:/nodews/openclaw-openclaw/src/commands/agent.ts)                                                                          | 运行 AI Agent 获取回复              |
| 出站投递         | [deliver.ts#L228](file:///d:/nodews/openclaw-openclaw/src/infra/outbound/deliver.ts#L228)                                                               | `deliverOutboundPayloads` 核心函数  |
| 渠道适配器加载   | [deliver.ts#L120-130](file:///d:/nodews/openclaw-openclaw/src/infra/outbound/deliver.ts#L120-L130)                                                      | `createChannelHandler` 加载插件     |
| 飞书适配器       | [outbound.ts#L1-55](file:///d:/nodews/openclaw-openclaw/extensions/feishu/src/outbound.ts)                                                              | `feishuOutbound.sendText/sendMedia` |
| 飞书 API 调用    | [send.ts#L126-165](file:///d:/nodews/openclaw-openclaw/extensions/feishu/src/send.ts#L126-L165)                                                         | 调用飞书 IM API                     |

#### 3.3.3 `deliverOutboundPayloads` 核心逻辑

```typescript
// deliver.ts
async function deliverOutboundPayloads(params) {
  // 1. 消息持久化（写前队列）
  const queueId = await enqueueDelivery({ channel, to, payloads, ... });

  // 2. 加载对应 Channel 的 Adapter（通过 Plugin 系统）
  const handler = await createChannelHandler({
    cfg, channel, to, deps, accountId, ...
  });

  // 3. 遍历每个 Payload 进行发送
  for (const payload of normalizedPayloads) {
    await handler.sendPayload(payload);
  }
}
```

**关键设计**：Channel 适配器通过 OpenClaw 的 **Plugin 系统** 动态加载。每个 Channel（如 Feishu）需要实现 `ChannelOutboundAdapter` 接口：

```typescript
// plugin-sdk 定义
interface ChannelOutboundAdapter {
  deliveryMode: "direct" | "queue";
  chunker?: (text: string, limit: number) => string[];
  sendText(params: { cfg; to; text; accountId }): Promise<SendResult>;
  sendMedia(params: { cfg; to; mediaUrl; accountId }): Promise<SendResult>;
}
```

#### 3.3.4 飞书发送实现

```typescript
// extensions/feishu/src/send.ts
export async function sendMessageFeishu(params) {
  const { cfg, to, text, replyToMessageId, mentions } = params;

  // 1. 构建消息内容（Markdown 转换 + @mention 处理）
  const messageText = getFeishuRuntime().channel.text.convertMarkdownTables(
    rawText,
    tableMode,
  );
  const { content, msgType } = buildFeishuPostMessagePayload({ messageText });

  // 2. 调用飞书 IM API
  const client = resolveFeishuClient({ cfg, accountId });

  if (replyToMessageId) {
    // 回复模式
    await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: { content, msg_type: msgType },
    });
  } else {
    // 新消息
    await client.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: { receive_id: receiveId, content, msg_type: msgType },
    });
  }
}
```

#### 3.3.5 会话路由与递送目标

在 `agent.request` 事件处理中，Gateway 通过以下方式解析消息递送目标：

```typescript
// server-node-events.ts - agent.request 处理
if (deliverRequested && (!channel || !to)) {
  // 1. 尝试从当前会话存储中获取上次使用的 channel/to
  const entryChannel = entry?.lastChannel;
  const entryTo = entry?.lastTo;
  if (!channel && entryChannel) channel = entryChannel;
  if (!to && entryTo) to = entryTo;
}
const deliver = deliverRequested && Boolean(channel && to);
```

**会话路由优先级**：

1. **事件负载中显式指定**：`payload.channel` + `payload.to`
2. **会话历史记录**：`lastChannel` + `lastTo`（用户上次对话的渠道）
3. **失败**：无法递送，记录警告日志

---

## 4. Device Token 机制

配对成功后，Gateway 颁发一个临时的 **deviceToken**，用于后续重连认证：

```typescript
// 重连时的 token 优先级
const resolvedDeviceToken =
  explicitDeviceToken ?? // 1. 显式传入的 deviceToken
  (!explicitGatewayToken // 2. 如果没有共享令牌
    ? (storedToken ?? undefined) //    则使用本地缓存的 deviceToken
    : undefined);
```

**Token 撤销场景**：如果 Gateway 返回 "device token mismatch"，说明 token 已被撤销，客户端会清除本地缓存并等待重新配对。

---

## 5. 安全设计总结

| 层级   | 技术                | 保护目标                   |
| ------ | ------------------- | -------------------------- |
| 传输层 | TLS 1.3 + wss://    | 数据传输机密性、完整性     |
| 传输层 | Certificate Pinning | 防止证书伪造的中间人攻击   |
| 身份层 | Ed25519 公私钥对    | 设备身份唯一性、不可伪造性 |
| 认证层 | Nonce 挑战          | 防止重放攻击               |
| 认证层 | 时间戳检查          | 防止签名长期有效           |
| 授权层 | 设备配对审批        | 防止未授权设备接入         |
| 存储层 | 文件权限 0o600      | 防止私钥泄露               |

---

## 6. 关键配置项

| 配置项                        | 说明                                     | 默认值                           |
| ----------------------------- | ---------------------------------------- | -------------------------------- |
| `gateway.tls.enabled`         | 是否启用 TLS                             | `true`（远程）或 `false`（本地） |
| `gateway.auth.mode`           | 认证模式（token/password/trusted-proxy） | `token`                          |
| `gateway.auth.allowTailscale` | 是否允许 Tailscale 身份绕过认证          | `false`                          |
| `OPENCLAW_GATEWAY_TOKEN`      | 共享访问令牌环境变量                     | -                                |
| `--tls-fingerprint`           | 期望的 TLS 证书指纹                      | -                                |
