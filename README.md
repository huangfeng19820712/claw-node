# ClawNode

OpenClaw 执行节点代理，负责接收任务、调用 Claude Code 执行，并将结果回传。

## 安装

```bash
npm install
```

## 配置

在 `~/.clawnode/config.env` 中配置：

```bash
# 工作目录
WORKDIR=E:/fwwork/javaws

# 飞书配置
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
NOTIFY_TARGET=ou_xxx

# Gateway 配置
GATEWAY_HOST=localhost
GATEWAY_PORT=18789
```

详细配置请查看 [node-feishu-download.md](node-feishu-download.md)。

## 使用

### 方式 A：本地 CLI 调用（推荐用于单机开发）

```bash
# 1. 构建
npm run build

# 2. 飞书开发任务（自动下载附件并执行）
npx clawnode feishu-exec --prompt "实现计算器功能"

# 3. 直接执行任务（不发送通知）
npx clawnode exec "创建一个 Express Hello World 项目"

# 4. 执行并发送通知到渠道
npx clawnode run "创建一个 Express Hello World 项目"
```

**CLI 命令说明**：

| 命令 | 说明 |
|------|------|
| `clawnode exec <prompt>` | 执行 Claude Code 命令 |
| `clawnode run <prompt>` | 执行并发送通知 |
| `clawnode feishu-exec` | 飞书开发任务（有附件下载，无附件直接执行） |
| `clawnode start` | 启动节点服务（推送/轮询模式） |
| `clawnode status` | 显示节点状态 |
| `clawnode config` | 显示当前配置 |
| `clawnode ws-send` | 通过 WebSocket 发送消息到渠道 |

详细 CLI 文档请查看 [CLI_USAGE.md](CLI_USAGE.md)。

### 方式 B：节点服务模式（推荐用于生产环境）

```bash
# 启动节点
npm start
# 或
npx clawnode start
```

## 项目结构

```
src/
├── index.ts           # 主入口，ClawNode 类
├── config.ts          # 配置管理
├── types.ts           # 类型定义
├── bin/
│   └── clawnode.ts    # CLI 入口
├── modules/
│   ├── task-poller.ts      # 任务轮询器（轮询模式）
│   ├── task-receiver.ts    # 任务接收器（推送模式）
│   ├── executor.ts         # 任务执行器
│   ├── session-manager.ts  # Session 管理器
│   ├── hook-receiver.ts    # Hook 回调接收器
│   ├── callback-client.ts  # 回调客户端
│   ├── websocket-sender.ts # WebSocket 消息发送器
│   ├── feishu-downloader.ts # 飞书附件下载器
│   └── log-streamer.ts     # 日志流式输出
├── utils/
│   └── logger.ts           # 日志工具
└── config/
    └── index.ts            # 配置
```

## 核心功能

- **Task Poller**: 从 OpenClaw 服务器轮询任务（轮询模式）
- **Task Receiver**: 接收 OpenClaw 推送的任务（推送模式）
- **Executor**: 调用 Claude Code 执行任务
- **Session Manager**: 管理 Session 生命周期（继续/暂停/恢复/锁定/删除）
- **Hook Receiver**: 接收和处理 Claude Code Hook 回调
- **Callback Client**: 将执行结果回传到 OpenClaw
- **Log Streamer**: 日志流式输出
- **WebSocket Sender**: 通过 WebSocket call 帧直接向 Gateway 发送消息（无需修改 OpenClaw）

## 运行模式

| 模式 | 说明 | 配置 |
|------|------|------|
| `push` | 推送模式，OpenClaw 直接推送任务 | `RUN_MODE=push` |
| `poll` | 轮询模式，ClawNode 轮询获取任务 | `RUN_MODE=poll` |
| `hybrid` | 混合模式，同时支持推送和轮询 | `RUN_MODE=hybrid`（默认） |

## Session 管理

Session 不会自动删除，必须由用户通过指令显式控制：

| 状态 | 说明 | 能否继续 | 能否删除 |
|------|------|----------|----------|
| `active` | 活跃 | ✅ | ✅ |
| `paused` | 暂停 | ❌（需先恢复） | ✅ |
| `locked` | 锁定 | ✅ | ❌（需先解锁） |
| `closed` | 已关闭 | ❌ | ✅ |

详细文档请查看 [SESSION_MANAGEMENT.md](SESSION_MANAGEMENT.md) 和 [CLI_USAGE.md](CLI_USAGE.md)。

## 任务状态机

```
PENDING → RUNNING → SUCCESS
              ↓
            FAILED
              ↓
            RETRY → RUNNING → SUCCESS
```

## 通知渠道

支持以下通知渠道：

- 钉钉
- 企业微信
- 飞书
- Telegram

配置方式请查看 [CLI_USAGE.md](CLI_USAGE.md#通知配置)。

## WebSocket 发送消息

通过 WebSocket call 帧直接向 Gateway 发送消息，支持所有 Gateway 配置的渠道：

- WhatsApp
- Telegram
- Discord
- Slack
- Signal
- LINE
- 飞书
- 钉钉
- 企业微信

### 快速开始

```bash
# 1. 生成密钥对
npx clawnode ws-generate-keys

# 2. 配置 .env 中的 DEVICE_TOKEN, DEVICE_ID, PRIVATE_KEY, PUBLIC_KEY

# 3. 发送消息
npx clawnode ws-send --to "+8613800138000" --message "Hello" --channel whatsapp
```

详细文档请查看 [WEBSOCKET_SEND_GUIDE.md](WEBSOCKET_SEND_GUIDE.md)。

## 开发

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 测试
npm test
```

## License

MIT

## 相关文档

- [CLI 使用指南](CLI_USAGE.md) - CLI 命令详细说明
- [Session 管理](SESSION_MANAGEMENT.md) - Session 生命周期管理
- [架构说明](ARCHITECTURE.md) - 系统架构说明
- [WebSocket 发送指南](WEBSOCKET_SEND_GUIDE.md) - WebSocket 消息发送功能
- [Agent Request 指南](AGENT_REQUEST_GUIDE.md) - agent.request 事件使用
