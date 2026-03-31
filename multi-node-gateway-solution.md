# 多 Node 连接 Gateway 解决方案

## 概述

本文档说明如何在同一台或多台机器上运行多个 Node 节点，同时连接到同一个 Gateway，以及如何让 `clawnode` 程序与 `openclaw node run` 同时运行而不冲突。

---

## 1. 问题分析

### 1.1 为什么两个 Node 不能同时连接？

Gateway 的 `NodeRegistry` 按 `nodeId`（即 `deviceId`）作为唯一 key 进行注册。

当两个 Node 使用相同的 `deviceId`（共享同一份 `~/.openclaw/identity/device.json`）时：

```
Node A 连接 (deviceId: abc123) → NodeRegistry.set("abc123", sessionA)
Node B 连接 (deviceId: abc123) → NodeRegistry.set("abc123", sessionB) ← 覆盖 sessionA
Node A 的连接被"挤掉"，变成 disconnected
```

**核心原因**：`deviceId` 相同导致后连接的 Node 覆盖了先连接的 Node session。

### 1.2 `openclaw node run` 与 `clawnode` 的关系

| 组件                | 说明                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `openclaw node run` | OpenClaw 官方的 Node Host 程序，基于 `GatewayClient` 连接 Gateway    |
| `clawnode`          | 你自己写的程序，也基于 `GatewayClient` 连接 Gateway                  |
| `deviceId`          | 由 `~/.openclaw/identity/device.json` 中的 Ed25519 公钥 SHA-256 得出 |
| **冲突条件**        | 两者使用相同的 `device.json`，后启动的会把先启动的挤掉               |

---

## 2. 解决方案

### 方案 A：每个 Node 使用独立的身份文件（推荐）

为每个 Node 创建独立的身份目录和环境变量：

#### 启动 `openclaw node run`

```bash
# 终端 1：启动 OpenClaw Node Host
OPENCLAW_IDENTITY_DIR="~/.openclaw/identities/openclaw-node" openclaw node run \
  --host localhost \
  --port 18789 \
  --display-name "OpenClaw Node"
```

#### 启动 `clawnode` 程序

```bash
# 终端 2：启动你的 clawnode 程序
OPENCLAW_IDENTITY_DIR="~/.openclaw/identities/clawnode" node your-clawnode-script.js
```

#### 在 clawnode 程序中指定身份目录

```typescript
import { loadOrCreateDeviceIdentity } from "openclaw/infra/device-identity";
import { GatewayClient } from "openclaw/gateway/client";

// 指定身份目录
const identityDir = process.env.OPENCLAW_IDENTITY_DIR ?? "~/.openclaw/identity";
const deviceIdentity = loadOrCreateDeviceIdentity({ identityDir });

const client = new GatewayClient({
  url: "ws://localhost:18789",
  deviceIdentity,
  // ... 其他配置
});

client.start();
```

### 方案 B：在代码中动态生成独立身份

如果你不想依赖文件系统的身份目录，可以在程序启动时每次生成新的 Ed25519 密钥对：

```typescript
import { generateKeyPairSync } from "node:crypto";
import { sha256 } from "node:crypto";

// 每次启动生成新的设备身份
function createNewDeviceIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const deviceId = sha256(publicKey); // 用公钥的 SHA-256 作为 deviceId

  return {
    deviceId,
    publicKeyPem: publicKey.export({ type: "pkcs8", format: "pem" }).toString(),
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };
}

const deviceIdentity = createNewDeviceIdentity();

const client = new GatewayClient({
  url: "ws://localhost:18789",
  deviceIdentity,
  clientName: "clawnode",
  displayName: "Build Node",
  // ...
});
```

**注意**：这种方式生成的 identity 不会持久化，重启后会变成新的 `deviceId`，Gateway 会认为是新 Node。

### 方案 C：使用不同的 Gateway 连接地址

如果你的 Gateway 支持多端口，可以在不同端口上启动多个 Gateway 实例：

```bash
# Gateway 实例 1（主）
openclaw gateway run --port 18789

# Gateway 实例 2（备用）
openclaw gateway run --port 18790
```

然后分别连接：

```bash
openclaw node run --gateway localhost:18789 --display-name "Node-1"
openclaw node run --gateway localhost:18790 --display-name "Node-2"
```

---

## 3. 验证多 Node 共存

### 3.1 在 Gateway 上查看已连接节点

```bash
openclaw nodes list
```

输出示例：

```
Connected Nodes:
  - Node-1 (deviceId: abc123...) @ 2026-03-31 12:00:00
  - Build Node (deviceId: def456...) @ 2026-03-31 12:05:00
```

### 3.2 调用指定的 Node 执行命令

```bash
# 调用 Node-1 执行命令
openclaw nodes run --node "Node-1" -- "echo hello"

# 调用 Build Node 执行命令
openclaw nodes run --node "Build Node" -- "echo hello"
```

### 3.3 在代码中调用指定 Node

```typescript
// nodes.invoke 调用时指定 nodeId
await nodeRegistry.invoke({
  nodeId: "Build Node", // 或 deviceId
  command: "system.run",
  params: { command: "claude --print hello" },
  timeoutMs: 60000,
});
```

---

## 4. 架构图

### 4.1 多 Node 连接架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Gateway                                  │
│  Port: 18789                                                     │
│                                                                   │
│  NodeRegistry:                                                    │
│    "abc123..." → NodeSession (OpenClaw Node)                     │
│    "def456..." → NodeSession (Build Node)                        │
│    "ghi789..." → NodeSession (CI Runner Node)                   │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         │                    │                    │
    ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
    │OpenClaw │          │ clawnode│          │ CI Node │
    │Node Host│          │ Program │          │ Program │
    └─────────┘          └─────────┘          └─────────┘
```

### 4.2 消息回调流程

```
飞书用户                    Gateway                      Node
   │                          │                          │
   │  发送开发任务             │                          │
   │─────────────────────────>│                          │
   │                          │                          │
   │                          │  node.invoke.request     │
   │                          │────────────────────────>│
   │                          │      (Build Node)        │
   │                          │                          │
   │                          │  agent.request           │
   │                          │  (deliver: true)         │
   │                          │<────────────────────────│
   │  飞书收到结果             │                          │
   │<─────────────────────────│                          │
```

---

## 5. 最佳实践

### 5.1 为每个 Node 创建独立身份

推荐目录结构：

```
~/.openclaw/
├── identity/                    # 默认身份（openclaw node run 使用）
│   └── device.json
├── identities/
│   ├── openclaw-node/
│   │   └── device.json
│   ├── build-node/
│   │   └── device.json
│   └── ci-runner/
│       └── device.json
└── configs/
    ├── openclaw-node.json
    ├── build-node.json
    └── ci-runner.json
```

### 5.2 启动脚本示例

#### Unix/Linux/macOS

```bash
#!/bin/bash

# 启动 OpenClaw Node
OPENCLAW_IDENTITY_DIR="$HOME/.openclaw/identities/openclaw-node" \
openclaw node run --display-name "OpenClaw Node" &

# 启动 Build Node
OPENCLAW_IDENTITY_DIR="$HOME/.openclaw/identities/build-node" \
node build-node.js &

wait
```

#### Windows (PowerShell)

```powershell
# 启动 OpenClaw Node
$env:OPENCLAW_IDENTITY_DIR = "$env:USERPROFILE\.openclaw\identities\openclaw-node"
Start-Process openclaw "node run --display-name 'OpenClaw Node'"

# 启动 Build Node
$env:OPENCLAW_IDENTITY_DIR = "$env:USERPROFILE\.openclaw\identities\build-node"
Start-Process node -ArgumentList "build-node.js"
```

### 5.3 clawnode 程序模板

```typescript
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

function loadOrCreateDeviceIdentity(): DeviceIdentity {
  const identityDir =
    process.env.OPENCLAW_IDENTITY_DIR ??
    path.join(process.env.HOME ?? "", ".openclaw", "identity");
  const deviceFile = path.join(identityDir, "device.json");

  // 如果已存在，直接加载
  if (fs.existsSync(deviceFile)) {
    return JSON.parse(fs.readFileSync(deviceFile, "utf-8"));
  }

  // 生成新的 Ed25519 密钥对
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const privateKeyPem = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();

  const publicKeyRaw = Buffer.from(publicKeyPem);
  const deviceId = crypto
    .createHash("sha256")
    .update(publicKeyRaw)
    .digest("hex");

  const identity: DeviceIdentity = { deviceId, publicKeyPem, privateKeyPem };

  // 确保目录存在
  fs.mkdirSync(path.dirname(deviceFile), { recursive: true });
  fs.writeFileSync(deviceFile, JSON.stringify(identity, null, 2));

  return identity;
}

async function main() {
  const deviceIdentity = loadOrCreateDeviceIdentity();
  console.log(`Starting clawnode with deviceId: ${deviceIdentity.deviceId}`);

  // 创建 GatewayClient 并连接
  const client = new GatewayClient({
    url: process.env.GATEWAY_URL ?? "ws://localhost:18789",
    deviceIdentity,
    clientName: "clawnode",
    clientDisplayName: "Build Node",
    role: "node",
    scopes: [],
    caps: ["system"],
    commands: ["system.run"],
    onHelloOk: (hello) => {
      console.log("Connected to Gateway:", hello);
    },
    onConnectError: (err) => {
      console.error("Connection error:", err.message);
    },
    onClose: (code, reason) => {
      console.log(`Gateway closed: ${code} - ${reason}`);
    },
  });

  client.start();
}

main().catch(console.error);
```

---

## 6. 故障排查

### 6.1 节点被挤掉（后启动的把先启动的覆盖）

**症状**：`openclaw nodes list` 只显示一个节点，或节点随机断开

**原因**：两个 Node 使用了相同的 `deviceId`

**解决**：

1. 检查 `openclaw nodes list` 确认每个节点的 `deviceId`
2. 为每个 Node 设置不同的 `OPENCLAW_IDENTITY_DIR`
3. 或在代码中每次生成新的密钥对

### 6.2 连接被拒绝

**症状**：`Error: gateway closed (1008): invalid device token`

**原因**：旧的 `deviceToken` 已失效，但还在尝试使用

**解决**：

```bash
# 清除旧的身份文件，重新生成
rm ~/.openclaw/identity/device.json
# 或为不同 Node 使用不同身份目录
```

### 6.3 节点状态为 disconnected

**症状**：`describe` 显示 `connected: false`

**可能原因**：

- `deviceId` 冲突，被其他节点覆盖
- Gateway 重启了
- 网络中断
- 节点进程崩溃（参考 `spawn EINVAL` 问题）

**排查**：

```bash
# 查看节点连接状态
openclaw nodes list

# 查看 Gateway 日志
openclaw logs --follow | grep -E "(node|connect|disconnect)"
```

---

## 7. 相关代码文件

| 文件                                                                                           | 说明                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| [gateway/client.ts](file:///d:/nodews/openclaw-openclaw/src/gateway/client.ts)                 | `GatewayClient` WebSocket 客户端实现    |
| [node-host/runner.ts](file:///d:/nodews/openclaw-openclaw/src/node-host/runner.ts)             | Node Host 启动入口，连接 Gateway        |
| [gateway/node-registry.ts](file:///d:/nodews/openclaw-openclaw/src/gateway/node-registry.ts)   | Gateway 端管理所有已连接 Node 的注册表  |
| [infra/device-identity.ts](file:///d:/nodews/openclaw-openclaw/src/infra/device-identity.ts)   | Ed25519 设备身份生成与管理              |
| [server-node-events.ts](file:///d:/nodews/openclaw-openclaw/src/gateway/server-node-events.ts) | 处理 Node 上报的 `agent.request` 等事件 |
| [deliver.ts](file:///d:/nodews/openclaw-openclaw/src/infra/outbound/deliver.ts)                | 出站消息投递（路由到飞书等渠道）        |
