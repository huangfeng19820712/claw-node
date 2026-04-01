# 飞书附件下载

## 概述

ClawNode 支持从飞书下载附件，并通过 Claude Code 执行开发任务，支持三种任务类型：

1. **纯文字任务** - 直接执行 prompt
2. **消息附件任务** - 下载飞书消息附件后执行
3. **云文档任务** - 下载飞书云文档后执行

实现"飞书发送需求 → Node 下载文件 → 执行开发 → 返回结果"的完整流程。

## 架构图

```
飞书用户                    Gateway                      Node
   │                           │                          │
   │  发送消息/附件            │                          │
   │──────────────────────────>│                          │
   │                           │                          │
   │                           │  nodes.run               │
   │                           │  clawnode feishu-exec    │
   │                           │────────────────────────>│
   │                           │                          │
   │                           │                          │  下载附件（可选）
   │                           │                          │  执行 Claude Code
   │                           │                          │  异步发送通知到飞书
   │                           │                          │
   │  收到开发结果             │                          │
   │<──────────────────────────│                          │
```

## 配置步骤

### 1. 创建配置文件

```bash
mkdir -p ~/.clawnode
```

复制 `config.example.env` 到 `~/.clawnode/config.env`：

```bash
cp E:/fwwork/javaws/claw-node/config.example.env ~/.clawnode/config.env
```

编辑 `~/.clawnode/config.env`：

```bash
WORKDIR=E:/fwwork/javaws
NOTIFY_TARGET=ou_xxxxxxxxxxxxxxxx
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
```

### 2. 注册 clawnode 身份

clawnode 使用独立的身份目录 `~/.clawnode/identity/`，与 OpenClaw 节点分离，避免冲突。

```powershell
# 设置环境变量
$env:OPENCLAW_STATE_DIR="$env:USERPROFILE\.clawnode"

# 运行一次进行注册
openclaw node run --display-name "clawnode"
```

注册成功后，会在 `~/.clawnode/identity/` 下生成：
- `device.json` - 设备密钥对
- `device-auth.json` - Gateway颁发的token

### 3. 获取飞书凭证

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 在「凭证与基础信息」中获取 AppId 和 AppSecret

### 4. 获取 NOTIFY_TARGET

飞书通知目标的 open_id，可以在飞书开放平台的「API 探索者」中调用 `/contact/v1/me` 获取。

## 使用方式

### 命令格式

```bash
# 纯文字任务
clawnode feishu-exec --prompt "任务描述"

# 消息附件任务
clawnode feishu-exec --message-id xxx --file-key xxx --prompt "任务描述"

# 云文档任务
clawnode feishu-exec --file-token xxx --prompt "任务描述"
```

### 参数说明

| 参数 | 说明 | 必填 |
|------|------|------|
| `--prompt` | 开发任务描述 | 是 |
| `--message-id` | 飞书消息 ID（消息附件时使用） | 消息附件时 |
| `--file-key` | 飞书文件 Key（消息附件时使用） | 消息附件时 |
| `--file-token` | 飞书云文档 Token（云文档时使用） | 云文档时 |
| `--workdir` | 工作目录（默认使用配置中的 WORKDIR） | 否 |
| `--notify-to` | 通知目标（默认使用配置中的 NOTIFY_TARGET） | 否 |
| `--app-id` | 飞书 App ID（可使用配置） | 否 |
| `--app-secret` | 飞书 App Secret（可使用配置） | 否 |

## 使用示例

### 情况1：纯文字消息（无附件）

```bash
clawnode feishu-exec --prompt "实现一个计算器功能"
```

### 情况2：有附件（PRD 文件）

```bash
clawnode feishu-exec --prompt "实现 PRD 中的功能" --message-id "msg_xxx" --file-key "file_xxx"
```

### 情况3：飞书云文档

```bash
clawnode feishu-exec --file-token "FKfPdDb3pobslTxKr9acIk1YnPg" --prompt "实现云文档中的功能"
```

### 情况4：指定工作目录和通知目标

```bash
clawnode feishu-exec \
  --prompt "实现计算器" \
  --workdir "E:/fwwork/javaws" \
  --notify-to "ou_xxx"
```

## Gateway 调用示例（TOOLS.md）

### 统一处理（三种任务类型）

```markdown
## 开发任务处理

当收到飞书消息时，使用 `feishu-exec` 统一处理：

**消息附件：**

```
action: run
node: "clawnode"
command: ["clawnode", "feishu-exec", "--message-id", "{message_id}", "--file-key", "{file_key}", "--prompt", "实现功能，完成后返回结果"]
```

**云文档：**

```
action: run
node: "clawnode"
command: ["clawnode", "feishu-exec", "--file-token", "{file_token}", "--prompt", "实现云文档中的功能"]
```

**纯文字：**

```
action: run
node: "clawnode"
command: ["clawnode", "feishu-exec", "--prompt", "{用户发送的文字开发任务}"]
```
```

## 环境变量说明

### 必需

| 变量 | 说明 |
|------|------|
| `FEISHU_APP_ID` | 飞书应用 App ID（下载附件时需要） |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret（下载附件时需要） |
| `NOTIFY_TARGET` | 飞书 open_id（发送通知时需要） |

### 可选（有默认值）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WORKDIR` | 默认工作目录 | 用户目录 |
| `GATEWAY_HOST` | Gateway 主机 | localhost |
| `GATEWAY_PORT` | Gateway 端口 | 18789 |

### 仅节点服务模式需要

| 变量 | 说明 |
|------|------|
| `OPENCLAW_URL` | OpenClaw 服务器地址 |
| `NODE_ID` | 节点标识 |
| `NODE_SECRET` | 节点密钥 |

> **说明**：只有运行 `clawnode start`（节点服务模式）时才需要配置 OPENCLAW_URL、NODE_ID、NODE_SECRET。使用 CLI 命令（`feishu-exec`、`ws-send` 等）不需要这些。

## 配置文件位置

| 配置文件 | 位置 | 用途 |
|----------|------|------|
| 主配置 | `~/.clawnode/config.env` | 所有环境变量配置 |
| 设备身份 | `~/.clawnode/identity/device.json` | 设备密钥对 |
| 设备令牌 | `~/.clawnode/identity/device-auth.json` | Gateway颁发的token |

## 注意事项

1. **安全**: `FEISHU_APP_SECRET` 和设备凭证不要直接写在命令中，使用配置文件
2. **Token 有效期**: 飞书 Access Token 有效期为 2 小时，模块会自动重新获取
3. **文件大小限制**: 飞书单文件下载限制为 20MB
4. **网络要求**: Node 必须能访问 `open.feishu.cn`
5. **身份独立**: clawnode 使用独立身份目录，与 openclaw node run 分离，避免冲突

## 故障排除

### 错误：device token mismatch

**原因**: clawnode 身份未注册或 token 无效

**解决**:
```powershell
$env:OPENCLAW_STATE_DIR="$env:USERPROFILE\.clawnode"
openclaw node run --display-name "clawnode"
```

### 错误：spawn ENOENT

**原因**: 命令路径问题

**解决**: 确保 PATH 中包含 claude.cmd 所在目录

### 创建文件失败：权限不足

**原因**: 工作目录没有写权限

**解决**: 检查 `WORKDIR` 配置的目录是否存在且可写

## 相关文档

- [CLI_USAGE.md](CLI_USAGE.md) - CLI 命令详细说明
- [WEBSOCKET_SEND_GUIDE.md](WEBSOCKET_SEND_GUIDE.md) - WebSocket 消息发送
- [multi-node-gateway-solution.md](multi-node-gateway-solution.md) - 多节点 Gateway 解决方案
