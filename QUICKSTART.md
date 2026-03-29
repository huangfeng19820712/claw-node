# ClawNode 快速启动指南

## 1 分钟快速开始

### 方式 A：本地 CLI 调用（推荐用于单机开发）

```bash
# 1. 安装依赖
npm install

# 2. 构建
npm run build

# 3. 直接执行任务（不发送通知）
npx clawnode exec "创建一个 Express Hello World 项目"

# 4. 执行并发送通知到渠道
npx clawnode run "创建一个 Express Hello World 项目"

# 5. 指定 Session（继续之前会话）
npx clawnode exec -s session-123 "添加用户认证功能"

# 6. 指定工作目录
npx clawnode exec -w /path/to/project "添加新的 API 端点"
```

**CLI 命令说明**：

| 命令 | 说明 |
|------|------|
| `clawnode exec <prompt>` | 执行 Claude Code 命令 |
| `clawnode exec --notify <prompt>` | 执行并发送通知 |
| `clawnode run <prompt>` | 快捷方式（= exec --notify） |
| `clawnode exec -s <id> <prompt>` | 使用指定 Session |
| `clawnode exec -w <dir> <prompt>` | 指定工作目录 |

### 方式 B：节点服务模式（推荐用于生产环境）

```bash
# 1. 复制环境配置
cp .env.example .env

# 2. 编辑 .env 文件，配置 OpenClaw 地址
# OPENCLAW_URL=http://your-openclaw-server:8080

# 3. 安装依赖
npm install

# 4. 构建
npm run build

# 5. 启动节点
npm start
```

---

## 节点服务模式 - 任务下发

### 在 OpenClaw 中注册节点

```javascript
// OpenClaw 管理界面添加节点
{
  id: 'node-001',
  name: 'ClawNode 开发节点',
  type: 'claw-node',
  pollUrl: 'http://claw-node-host:3000/api/tasks/poll',
  callbackUrl: 'http://claw-node-host:3001/api/callbacks'
}
```

### 下发第一个任务

```javascript
// OpenClaw 服务端 - 创建任务
const task = {
  id: 'task-001',
  nodeId: 'node-001',
  type: 'EXECUTE',
  prompt: '创建一个简单的 Express Hello World 项目',
  metadata: {
    projectType: 'new',
    targetDirectory: '/tmp/hello-world'
  }
}

// 保存到数据库，ClawNode 会在 5 秒内轮询获取
```

---

## 任务类型速查

| 任务类型 | 用途 | 示例 |
|----------|------|------|
| `EXECUTE` | 执行开发任务 | 创建项目、添加功能 |
| `SESSION_CONTINUE` | 继续会话 | 多轮对话开发 |
| `SESSION_PAUSE` | 暂停会话 | 等待用户确认 |
| `SESSION_RESUME` | 恢复会话 | 用户确认后继续 |
| `SESSION_DELETE` | 删除会话 | 清理 Session |
| `SESSION_LIST` | 列出会话 | 查看所有 Session |

---

## 常用场景

### 场景 1：本地 CLI - 新项目开发

```bash
# 1. 创建项目（发送通知）
clawnode run "创建一个新的 Node.js Express 项目，包含基本的 Hello World 路由"

# 2. 继续开发（复用 Session）
clawnode exec -s <session-id> "添加用户登录功能"

# 3. 再次继续
clawnode exec -s <session-id> "添加数据库连接"
```

### 场景 2：本地 CLI - 现有项目开发

```bash
# 1. 在现有项目中添加功能
clawnode run -w /path/to/your/project "添加新的 API 端点 /api/users"

# 2. 修复 bug
clawnode run -w /path/to/your/project "修复登录页面的验证问题"
```

### 场景 3：节点服务 - OpenClaw 下发任务

```javascript
// OpenClaw 服务端 - 创建任务（推送模式）
const task = {
  id: 'task-001',
  type: 'EXECUTE',
  prompt: '创建一个简单的 Express Hello World 项目',
  metadata: {
    projectType: 'new',
    targetDirectory: '/tmp/hello-world'
  }
}

// 推送到 ClawNode
POST http://clawnode:3000/api/tasks
{ task }
```

```javascript
// 列出所有 Session
{ type: 'SESSION_LIST' }

// 查询特定 Session
{
  type: 'QUERY',
  sessionId: 'session-abc-123'
}

// 删除 Session
{
  type: 'SESSION_DELETE',
  sessionId: 'session-abc-123'
}
```

---

## 回调处理

### OpenClaw 需要实现的回调接口

```javascript
// Express 示例
app.post('/api/callbacks', (req, res) => {
  const { taskId, event, data } = req.body

  switch (event) {
    case 'start':
      console.log(`任务 ${taskId} 开始执行`)
      break
    case 'output':
      console.log(`输出：${data.output}`)
      break
    case 'complete':
      console.log(`任务 ${taskId} 完成`)
      break
    case 'error':
      console.error(`任务 ${taskId} 失败：${data.error}`)
      break
  }

  res.json({ received: true })
})
```

---

## 配置文件说明

### .env

```bash
# OpenClaw 服务器地址
OPENCLAW_URL=http://localhost:3000

# 节点标识
NODE_ID=node-001

# 节点密钥
NODE_SECRET=your-secret-key

# 轮询间隔（毫秒）
POLL_INTERVAL=5000

# Hook 端口
HOOK_PORT=3001

# 执行超时（毫秒）
EXEC_TIMEOUT=300000

# 日志级别
LOG_LEVEL=info
```

---

## 故障排除

### 问题：ClawNode 没有获取任务

1. 检查 `OPENCLAW_URL` 是否正确
2. 检查节点认证（`NODE_SECRET`）
3. 查看日志：`npm run dev` 查看详细日志
4. 确认任务状态是 `PENDING`

### 问题：回调没有收到

1. 检查 `HOOK_PORT` 是否被占用
2. 确认 `callbackUrl` 配置正确
3. 检查防火墙设置

### 问题：Session 被删除了

Session 不会自动删除，必须显式发送 `SESSION_DELETE` 才会删除。
如果使用了 `SESSION_LOCK`，需要先解锁才能删除。

---

## 详细文档

- `OPENCLAW_INTEGRATION.md` - 完整集成指南
- `SESSION_MANAGEMENT.md` - Session 管理文档
- `SESSION_QUICK_REFERENCE.md` - 快速参考
