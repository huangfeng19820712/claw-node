# ClawNode 推送模式部署指南

## 架构说明

```
用户在渠道发送指令
    ↓
OpenClaw 接收
    ↓
OpenClaw 直接 POST 到 ClawNode 节点 (HTTP PUSH)
    ↓
ClawNode 执行 Claude Code
    ↓
Claude Code 完成
    ↓
ClawNode 通过 openclaw CLI 发送通知到渠道
```

## 运行模式

ClawNode 支持三种运行模式：

| 模式 | 说明 | 配置 |
|------|------|------|
| `push` | 纯推送模式，OpenClaw 直接推送任务 | `RUN_MODE=push` |
| `poll` | 纯轮询模式，ClawNode 轮询获取任务 | `RUN_MODE=poll` |
| `hybrid` | 混合模式，同时支持推送和轮询 | `RUN_MODE=hybrid` (默认) |

---

## 部署步骤

### 步骤 1：配置环境变量

复制 `.env.example` 为 `.env`：

```bash
# OpenClaw 服务器地址（用于回调）
OPENCLAW_URL=http://openclaw-server:8080

# 节点标识
NODE_ID=node-001

# 节点密钥（用于签名验证，推送模式必需）
NODE_SECRET=your-secret-key

# 运行模式：push（推送）, poll（轮询）, hybrid（混合）
RUN_MODE=hybrid

# 推送模式接收端口
RECEIVER_PORT=3000

# Hook 回调服务端口
HOOK_PORT=3001

# 执行超时时间（毫秒）
EXEC_TIMEOUT=300000

# 通知配置（用于发送消息到渠道）
OPENCLAW_BIN=/home/ubuntu/.npm-global/bin/openclaw
NOTIFY_CHANNEL=telegram
NOTIFY_TARGET=@your-group
```

### 步骤 2：启动 ClawNode

```bash
# 安装依赖
npm install

# 构建
npm run build

# 启动（根据 RUN_MODE 自动选择）
npm start
```

### 步骤 3：OpenClaw 端推送配置

```javascript
// OpenClaw 服务端 - 推送任务到节点
const crypto = require('crypto')

async function pushTaskToNode(node, task) {
  const signature = crypto
    .createHmac('sha256', node.secret)
    .update(JSON.stringify({ task }))
    .digest('hex')

  const response = await fetch(node.pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Claw-Signature': `sha256=${signature}`
    },
    body: JSON.stringify({ task })
  })

  return response.json()
}
```

---

## API 接口

### 健康检查

```bash
GET /health

# 响应
{
  "status": "ok",
  "nodeId": "node-001",
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

### 节点状态

```bash
GET /api/status

# 响应
{
  "nodeId": "node-001",
  "mode": "hybrid",
  "port": 3000,
  "hookPort": 3001
}
```

### 接收任务

```bash
POST /api/tasks

# 请求头
X-Claw-Signature: sha256=abc123...

# 请求体
{
  "task": {
    "id": "task-001",
    "type": "EXECUTE",
    "prompt": "创建新项目",
    "metadata": {}
  }
}

# 响应
{
  "received": true,
  "taskId": "task-001"
}
```

---

## 完整流程示例

### 1. 用户在渠道发送指令

```
用户 @clawnode 创建一个 Express 项目
```

### 2. OpenClaw 接收并推送

```javascript
// OpenClaw 机器人接收到消息
// 创建任务并推送到 ClawNode
POST http://clawnode:3000/api/tasks
{
  "task": {
    "id": "task-001",
    "type": "EXECUTE",
    "prompt": "创建一个 Express 项目"
  }
}
```

### 3. ClawNode 接收并执行

```
ClawNode 接收任务
  ↓
立即响应 { "received": true }
  ↓
异步执行 Claude Code
  ↓
创建项目文件、安装依赖、生成代码
```

### 4. 发送通知到渠道

```bash
# Hook 脚本执行
openclaw message send \
  --channel telegram \
  --target @your-group \
  --message "✅ 任务完成..."
```

### 5. 渠道收到通知

```
✅ ClawNode 任务完成

📋 任务 ID: task-001
📝 执行摘要：Express 项目创建完成...
```

---

## 相关文件

- `src/modules/task-receiver.ts` - 任务接收器（推送模式）
- `src/index.ts` - ClawNode 主类（支持三种模式）
- `src/config.ts` - 配置管理（添加 mode 配置）
- `.env.example` - 环境变量模板
- `.claude/hooks/notify-openclaw.sh` - 通知脚本

```typescript
import express, { Request, Response } from 'express'
import { logger } from '../utils/logger'
import { Task, TaskStatus } from '../types'
import { CallbackClient } from './callback-client'
import { HookReceiver } from './hook-receiver'

export interface TaskReceiverConfig {
  port: number
  nodeId: string
  nodeSecret: string
  onTaskReceived: (task: Task) => Promise<void>
}

/**
 * TaskReceiver - 任务接收器
 * 接收 OpenClaw 推送的任务
 */
export class TaskReceiver {
  private app: express.Application
  private config: TaskReceiverConfig
  private callbackClient: CallbackClient
  private hookReceiver: HookReceiver

  constructor(config: TaskReceiverConfig) {
    this.config = config
    this.app = express()
    this.callbackClient = new CallbackClient('', config.nodeId)
    this.hookReceiver = new HookReceiver(config.port + 1, this.callbackClient)
  }

  /**
   * 启动接收服务
   */
  async start(): Promise<void> {
    this.app.use(express.json())

    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', nodeId: this.config.nodeId })
    })

    // 接收任务
    this.app.post('/api/tasks', async (req: Request, res: Response) => {
      try {
        // 验证签名
        const signature = req.headers['x-claw-signature'] as string
        if (!this.verifySignature(req.body, signature)) {
          logger.warn('Invalid signature')
          return res.status(401).json({ error: 'Invalid signature' })
        }

        const task: Task = req.body.task

        logger.info('Task received', { taskId: task.id, type: task.type })

        // 立即响应
        res.json({ received: true, taskId: task.id })

        // 异步处理任务
        setImmediate(() => this.handleTask(task))

      } catch (error) {
        logger.error('Task receive error', error)
        res.status(500).json({ error: 'Internal error' })
      }
    })

    // 启动 Hook 接收服务
    await this.hookReceiver.start()

    // 启动 HTTP 服务
    this.app.listen(this.config.port, () => {
      logger.info(`TaskReceiver started on port ${this.config.port}`)
    })
  }

  /**
   * 处理任务
   */
  private async handleTask(task: Task): Promise<void> {
    try {
      // 通知任务开始
      await this.callbackClient.onStart(task.id, {
        nodeId: this.config.nodeId,
        startedAt: new Date().toISOString()
      })

      // 触发 Hook
      await this.hookReceiver.triggerTaskHook(task.hooks, 'onStart', { taskId: task.id })

      // 调用 clawnode CLI 执行
      const { spawn } = require('child_process')

      return new Promise((resolve) => {
        const args = ['exec', JSON.stringify(task)]
        const child = spawn('clawnode', args)

        let output = ''
        let errorOutput = ''

        child.stdout.on('data', (data: Buffer) => {
          const chunk = data.toString()
          output += chunk
          // 实时输出
          this.callbackClient.onOutput(task.id, chunk)
        })

        child.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString()
        })

        child.on('close', async (code: number) => {
          if (code === 0) {
            await this.callbackClient.onComplete(task.id, {
              status: 'SUCCESS',
              output,
              completedAt: new Date().toISOString()
            })
          } else {
            await this.callbackClient.onError(task.id, errorOutput)
          }
          resolve()
        })
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Task handle error', { taskId: task.id, error: errorMessage })
      await this.callbackClient.onError(task.id, errorMessage)
    }
  }

  /**
   * 验证签名
   */
  private verifySignature(body: unknown, signature: string): boolean {
    // TODO: 实现 HMAC 签名验证
    const crypto = require('crypto')
    const expected = crypto
      .createHmac('sha256', this.config.nodeSecret)
      .update(JSON.stringify(body))
      .digest('hex')
    return signature === `sha256=${expected}`
  }
}

export default TaskReceiver
```

### 步骤 2：更新 ClawNode 主类

修改 `src/index.ts`，支持推送模式：

```typescript
import { TaskReceiver } from './modules/task-receiver'

export class ClawNode {
  private taskReceiver: TaskReceiver

  constructor() {
    // ... 现有初始化代码

    // 初始化任务接收器
    this.taskReceiver = new TaskReceiver({
      port: config.receiverPort || 3000,
      nodeId: config.nodeId,
      nodeSecret: config.nodeSecret,
      onTaskReceived: (task) => this.handleTask(task)
    })
  }

  async start(): Promise<void> {
    logger.info('Starting ClawNode (push mode)...')

    // 启动 Hook 接收服务
    await this.hookReceiver.start()

    // 启动任务接收服务
    await this.taskReceiver.start()

    // 可选：也开始轮询（混合模式）
    if (config.pollInterval > 0) {
      this.taskPoller.startPolling(async (task) => {
        await this.handleTask(task)
      })
    }

    logger.info('ClawNode started in push mode')
  }
}
```

### 步骤 3：更新配置

**`.env` 文件**：

```bash
# OpenClaw 服务器地址（用于回调）
OPENCLAW_URL=http://openclaw-server:8080

# 节点标识
NODE_ID=node-001

# 节点密钥（用于签名验证）
NODE_SECRET=your-secret-key

# 推送模式配置
RECEIVER_PORT=3000

# Hook 回调服务端口
HOOK_PORT=3001

# 通知配置
OPENCLAW_BIN=/home/ubuntu/.npm-global/bin/openclaw
NOTIFY_CHANNEL=telegram
NOTIFY_TARGET=@your-group
```

**`package.json` scripts**：

```json
{
  "scripts": {
    "start": "node dist/bin/clawnode.js start",
    "start:push": "node dist/bin/clawnode.js start --mode push",
    "dev": "ts-node src/bin/clawnode.ts start"
  }
}
```

### 步骤 4：OpenClaw 端配置

**OpenClaw 推送配置**：

```yaml
# config/nodes.yaml
nodes:
  - id: node-001
    name: ClawNode 001
    type: push
    pushUrl: http://clawnode-host:3000/api/tasks
    secret: your-secret-key
    status: active
```

**OpenClaw 推送代码示例**：

```javascript
// OpenClaw 服务端 - 推送任务到节点
const crypto = require('crypto')

async function pushTaskToNode(node, task) {
  const signature = crypto
    .createHmac('sha256', node.secret)
    .update(JSON.stringify({ task }))
    .digest('hex')

  const response = await fetch(node.pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Claw-Signature': `sha256=${signature}`
    },
    body: JSON.stringify({ task })
  })

  return response.json()
}

// 用户在渠道发送指令时
app.post('/api/command', async (req, res) => {
  const { channel, message } = req.body

  // 创建任务
  const task = {
    id: `task-${Date.now()}`,
    type: 'EXECUTE',
    prompt: message,
    metadata: { channel, from: 'user-command' }
  }

  // 推送到节点
  const node = await getActiveNode()
  await pushTaskToNode(node, task)

  res.json({ sent: true, taskId: task.id })
})
```

---

## 完整流程

### 1. 用户在渠道发送指令

```
用户 @clawnode 创建一个 Express 项目
```

### 2. OpenClaw 接收并推送

```javascript
// OpenClaw 机器人接收到消息
// 创建任务并推送到 ClawNode
POST http://clawnode:3000/api/tasks
{
  "task": {
    "id": "task-001",
    "type": "EXECUTE",
    "prompt": "创建一个 Express 项目"
  }
}
```

### 3. ClawNode 接收并执行

```typescript
// ClawNode 接收任务
// 立即响应 OpenClaw
{ "received": true, "taskId": "task-001" }

// 异步执行
clawnode exec '{"id": "task-001", ...}'
```

### 4. Claude Code 执行

```
Claude Code 运行
  ↓
创建项目文件
  ↓
安装依赖
  ↓
生成代码
```

### 5. 发送通知到渠道

```bash
# Hook 脚本执行
.claude/hooks/notify-openclaw.sh

# 发送消息
openclaw message send \
  --channel telegram \
  --target @your-group \
  --message "✅ 任务完成..."
```

### 6. 渠道收到通知

```
✅ ClawNode 任务完成

📋 任务 ID: task-001
📝 执行摘要：Express 项目创建完成...
```

---

## 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `RECEIVER_PORT` | HTTP 接收服务端口 | 3000 |
| `HOOK_PORT` | Hook 回调服务端口 | 3001 |
| `NODE_SECRET` | 节点密钥（签名验证） | 必需 |
| `OPENCLAW_BIN` | openclaw CLI 路径 | `openclaw` |
| `NOTIFY_CHANNEL` | 通知渠道 | `telegram` |
| `NOTIFY_TARGET` | 通知目标群组 | - |

---

## 测试

### 测试推送接收

```bash
# 启动 ClawNode
npm start

# 发送测试任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -H "X-Claw-Signature: sha256=xxx" \
  -d '{"task": {"id": "test-001", "type": "EXECUTE", "prompt": "Hello"}}'
```

### 测试通知

```bash
# 设置环境变量
export OPENCLAW_BIN=/path/to/openclaw
export NOTIFY_TARGET=@test-group

# 手动触发 Hook
echo '{"taskId": "test-001", "event": "complete", "data": {"status": "SUCCESS"}}' | bash .claude/hooks/notify-openclaw.sh
```

---

## 相关文件

- `src/modules/task-receiver.ts` - 任务接收器（推送模式）
- `.claude/hooks/notify-openclaw.sh` - 通知脚本
- `OPENCLAW_CHANNEL_INTEGRATION.md` - 渠道集成文档
