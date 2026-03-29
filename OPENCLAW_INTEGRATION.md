# OpenClaw 集成指南

## 概述

本文档说明如何在 OpenClaw 中配置和使用 ClawNode 节点，包括任务下发、Session 控制和回调处理。

---

## 1. OpenClaw 端配置

### 1.1 注册 ClawNode 节点

OpenClaw 需要在数据库中注册 ClawNode 节点信息：

```javascript
// OpenClaw 服务端代码示例
const node = {
  id: 'node-001',
  name: '开发节点 1',
  type: 'claw-node',
  status: 'active',
  config: {
    pollInterval: 5000,      // 5 秒轮询一次
    timeout: 300000,         // 5 分钟超时
    supportedTypes: ['EXECUTE', 'SESSION_*', 'QUERY']
  },
  callbackUrl: 'http://claw-node-host:3001/api/callbacks'
}
```

### 1.2 节点认证

OpenClaw 需要验证 ClawNode 的请求：

```javascript
// OpenClaw 服务端 - 节点认证中间件
function authenticateNode(req, res, next) {
  const nodeId = req.headers['x-node-id']
  const signature = req.headers['x-node-signature']

  const node = await db.nodes.findById(nodeId)
  if (!node || node.secret !== signature) {
    return res.status(401).json({ error: 'Invalid node' })
  }

  req.node = node
  next()
}
```

---

## 2. 任务下发 API

### 2.1 创建任务

OpenClaw 将任务保存到数据库，等待 ClawNode 轮询获取：

```javascript
// OpenClaw 服务端 - 创建任务
async function createTask(taskData) {
  const task = {
    id: `task-${Date.now()}-${randomString(8)}`,
    nodeId: taskData.nodeId,
    type: taskData.type,           // EXECUTE, SESSION_CONTINUE, etc.
    status: 'PENDING',
    prompt: taskData.prompt,
    sessionId: taskData.sessionId, // 可选
    prdPath: taskData.prdPath,     // 可选
    metadata: taskData.metadata,   // 可选
    hooks: taskData.hooks,         // 可选
    timeout: taskData.timeout,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  await db.tasks.create(task)
  return task
}
```

### 2.2 任务轮询接口

ClawNode 通过轮询获取任务：

```javascript
// OpenClaw 服务端 - 任务轮询
app.get('/api/tasks/poll', authenticateNode, async (req, res) => {
  const { nodeId } = req.node

  // 获取该节点的待处理任务
  const task = await db.tasks.findOne({
    nodeId,
    status: 'PENDING'
  }, {
    sort: { createdAt: 1 }
  })

  if (task) {
    res.json({ task, shouldPoll: true })
  } else {
    res.json({ task: null, shouldPoll: true, interval: 5000 })
  }
})
```

### 2.3 任务状态更新

```javascript
// OpenClaw 服务端 - 更新任务状态
app.put('/api/tasks/:taskId/status', authenticateNode, async (req, res) => {
  const { taskId } = req.params
  const { status, output, error, exitCode } = req.body

  await db.tasks.update(taskId, {
    status,
    output,
    error,
    exitCode,
    updatedAt: new Date().toISOString()
  })

  res.json({ success: true })
})
```

---

## 3. 回调处理 API

### 3.1 任务开始回调

```javascript
// OpenClaw 服务端 - 任务开始回调
app.post('/api/callbacks', authenticateNode, async (req, res) => {
  const { taskId, event, data } = req.body

  switch (event) {
    case 'start':
      await handleTaskStart(taskId, data)
      break
    case 'output':
      await handleTaskOutput(taskId, data)
      break
    case 'complete':
      await handleTaskComplete(taskId, data)
      break
    case 'error':
      await handleTaskError(taskId, data)
      break
  }

  res.json({ received: true })
})

async function handleTaskStart(taskId, data) {
  await db.tasks.update(taskId, {
    status: 'RUNNING',
    startedAt: data.startedAt,
    nodeId: data.nodeId
  })

  // 通知前端（WebSocket/Server-Sent Events）
  emitToClient('task:start', { taskId, ...data })
}

async function handleTaskOutput(taskId, data) {
  // 追加输出内容
  await db.taskOutputs.insert({ taskId, content: data.output, timestamp: new Date() })

  // 实时推送到前端
  emitToClient('task:output', { taskId, output: data.output })
}

async function handleTaskComplete(taskId, data) {
  await db.tasks.update(taskId, {
    status: 'SUCCESS',
    output: data.output,
    error: data.error,
    exitCode: data.exitCode,
    completedAt: data.completedAt
  })

  emitToClient('task:complete', { taskId, ...data })
}

async function handleTaskError(taskId, data) {
  await db.tasks.update(taskId, {
    status: 'FAILED',
    error: data.error,
    completedAt: new Date()
  })

  emitToClient('task:error', { taskId, error: data.error })
}
```

---

## 4. 任务类型使用示例

### 4.1 EXECUTE - 执行开发任务

#### 新项目开发

```javascript
const task = await createTask({
  nodeId: 'node-001',
  type: 'EXECUTE',
  prompt: `请根据以下 PRD 创建一个新的 Node.js 博客系统：

# 博客系统 PRD

## 功能需求
1. 用户注册/登录 (JWT 认证)
2. 文章 CRUD 操作
3. 评论系统
4. 标签分类

## 技术栈
- Node.js 18+
- Express 4.x
- MongoDB + Mongoose

## 目录结构
- src/controllers - 控制器
- src/models - 数据模型
- src/routes - 路由
- src/middleware - 中间件`,
  prdPath: '/prd/blog-system.md',
  metadata: {
    projectType: 'new',
    targetDirectory: '/home/user/projects/blog-backend',
    techStack: ['nodejs', 'express', 'mongodb']
  },
  timeout: 600000, // 10 分钟
  hooks: {
    onStart: 'http://openclaw/api/hooks/start',
    onOutput: 'http://openclaw/api/hooks/output',
    onComplete: 'http://openclaw/api/hooks/complete',
    onError: 'http://openclaw/api/hooks/error'
  }
})

// 保存 sessionId 供后续使用
const sessionId = await waitForTaskCompletion(task.id)
// sessionId = "session-abc-123"
```

#### 现有项目开发

```javascript
const task = await createTask({
  nodeId: 'node-001',
  type: 'EXECUTE',
  prompt: '在当前项目中添加新的用户资料 API：\n1. GET /api/profile\n2. PUT /api/profile\n3. 添加相应的验证逻辑',
  metadata: {
    projectType: 'existing',
    projectRoot: '/home/user/projects/my-app',
    workingDirectory: '/home/user/projects/my-app'
  },
  timeout: 300000
})
```

### 4.2 SESSION_CONTINUE - 继续会话

```javascript
// 使用之前保存的 sessionId
const task = await createTask({
  nodeId: 'node-001',
  type: 'SESSION_CONTINUE',
  sessionId: 'session-abc-123', // 必需
  prompt: '现在请添加单元测试，使用 Jest 框架'
})
```

### 4.3 SESSION_PAUSE - 暂停会话

```javascript
// 暂停会话，等待用户确认
const task = await createTask({
  nodeId: 'node-001',
  type: 'SESSION_PAUSE',
  sessionId: 'session-abc-123'
})

await waitForTaskCompletion(task.id)
// Session 状态变为 'paused'
```

### 4.4 SESSION_RESUME - 恢复会话

```javascript
// 用户确认后恢复会话
const task = await createTask({
  nodeId: 'node-001',
  type: 'SESSION_RESUME',
  sessionId: 'session-abc-123',
  prompt: '用户确认代码审查通过，请继续完成开发'
})
```

### 4.5 SESSION_LOCK - 锁定会话

```javascript
// 锁定会话，防止误删
const task = await createTask({
  nodeId: 'node-001',
  type: 'SESSION_LOCK',
  sessionId: 'session-abc-123'
})
```

### 4.6 SESSION_UNLOCK - 解锁会话

```javascript
const task = await createTask({
  nodeId: 'node-001',
  type: 'SESSION_UNLOCK',
  sessionId: 'session-abc-123'
})
```

### 4.7 SESSION_DELETE - 删除会话

```javascript
// 删除会话（唯一删除方式）
const task = await createTask({
  nodeId: 'node-001',
  type: 'SESSION_DELETE',
  sessionId: 'session-abc-123'
})
```

### 4.8 SESSION_LIST - 列出所有会话

```javascript
const task = await createTask({
  nodeId: 'node-001',
  type: 'SESSION_LIST'
})

const result = await waitForTaskCompletion(task.id)
const sessions = JSON.parse(result.output).sessions
console.log('活跃会话:', sessions)

// 输出示例:
// [
//   {
//     id: "session-abc-123",
//     taskId: "task-001",
//     status: "active",
//     createdAt: "2026-03-25T10:00:00.000Z",
//     lastActivityAt: "2026-03-25T11:30:00.000Z",
//     messageCount: 28,
//     projectRoot: "/home/user/projects/blog-backend",
//     projectType: "new",
//     isLocked: false
//   }
// ]
```

### 4.9 QUERY - 查询状态

```javascript
// 查询特定会话状态
const task = await createTask({
  nodeId: 'node-001',
  type: 'QUERY',
  sessionId: 'session-abc-123'
})

const result = await waitForTaskCompletion(task.id)
const sessionInfo = JSON.parse(result.output).session
console.log('会话详情:', sessionInfo)
```

---

## 5. 完整使用流程示例

### 5.1 新项目开发完整流程

```javascript
class OpenClawTaskManager {
  constructor() {
    this.sessions = new Map() // projectId -> sessionId
  }

  // 1. 创建新项目
  async createNewProject(projectId, prdContent, config) {
    const task = await this.sendTask({
      nodeId: 'node-001',
      type: 'EXECUTE',
      prompt: prdContent,
      metadata: {
        projectType: 'new',
        targetDirectory: config.targetDirectory,
        techStack: config.techStack
      },
      timeout: 600000
    })

    const result = await this.waitForCompletion(task.id)
    const sessionId = result.sessionId

    // 保存 sessionId
    this.sessions.set(projectId, sessionId)

    return { sessionId, result }
  }

  // 2. 继续开发
  async continueDevelopment(projectId, prompt) {
    const sessionId = this.sessions.get(projectId)
    if (!sessionId) {
      throw new Error('Session not found for project')
    }

    const task = await this.sendTask({
      nodeId: 'node-001',
      type: 'SESSION_CONTINUE',
      sessionId,
      prompt
    })

    return this.waitForCompletion(task.id)
  }

  // 3. 暂停等待确认
  async pauseAndAwaitConfirmation(projectId) {
    const sessionId = this.sessions.get(projectId)

    await this.sendTask({
      nodeId: 'node-001',
      type: 'SESSION_PAUSE',
      sessionId
    })

    // 等待用户确认（前端 UI 交互）
    return new Promise((resolve) => {
      this.onUserConfirm = () => resolve()
    })
  }

  // 4. 恢复开发
  async resumeDevelopment(projectId, prompt) {
    const sessionId = this.sessions.get(projectId)

    return this.sendTask({
      nodeId: 'node-001',
      type: 'SESSION_RESUME',
      sessionId,
      prompt
    })
  }

  // 5. 锁定项目（长期保存）
  async lockProject(projectId) {
    const sessionId = this.sessions.get(projectId)

    return this.sendTask({
      nodeId: 'node-001',
      type: 'SESSION_LOCK',
      sessionId
    })
  }

  // 6. 删除项目
  async deleteProject(projectId) {
    const sessionId = this.sessions.get(projectId)
    if (!sessionId) return

    // 先解锁
    await this.sendTask({
      nodeId: 'node-001',
      type: 'SESSION_UNLOCK',
      sessionId
    })

    // 再删除
    await this.sendTask({
      nodeId: 'node-001',
      type: 'SESSION_DELETE',
      sessionId
    })

    this.sessions.delete(projectId)
  }

  // 7. 列出所有项目
  async listProjects() {
    const task = await this.sendTask({
      nodeId: 'node-001',
      type: 'SESSION_LIST'
    })

    const result = await this.waitForCompletion(task.id)
    return JSON.parse(result.output).sessions
  }

  // 辅助方法
  async sendTask(taskData) {
    // 保存到数据库
    return db.tasks.create(taskData)
  }

  async waitForCompletion(taskId) {
    // 轮询任务状态
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        const task = await db.tasks.findById(taskId)
        if (task.status === 'SUCCESS') {
          resolve(task)
        } else if (task.status === 'FAILED') {
          reject(new Error(task.error))
        } else {
          setTimeout(checkStatus, 1000)
        }
      }
      checkStatus()
    })
  }
}

// 使用示例
const taskManager = new OpenClawTaskManager()

// 创建新项目
const { sessionId } = await taskManager.createNewProject('blog-001', prdContent, {
  targetDirectory: '/home/user/projects/blog',
  techStack: ['nodejs', 'express', 'mongodb']
})

// 继续开发
await taskManager.continueDevelopment('blog-001', '添加用户认证功能')

// 暂停等待确认
await taskManager.pauseAndAwaitConfirmation('blog-001')
// ... 用户在前端确认 ...
await taskManager.resumeDevelopment('blog-001', '继续完成开发')

// 锁定项目
await taskManager.lockProject('blog-001')

// 列出所有项目
const projects = await taskManager.listProjects()
console.log(projects)

// 删除项目
await taskManager.deleteProject('blog-001')
```

---

## 6. 前端 UI 集成

### 6.1 WebSocket 实时通知

```javascript
// OpenClaw 前端 - WebSocket 连接
const ws = new WebSocket('ws://openclaw/ws')

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  switch (message.type) {
    case 'task:start':
      updateTaskStatus(message.taskId, 'running')
      break

    case 'task:output':
      appendTaskOutput(message.taskId, message.output)
      break

    case 'task:complete':
      updateTaskStatus(message.taskId, 'success', message.result)
      break

    case 'task:error':
      updateTaskStatus(message.taskId, 'failed', message.error)
      break
  }
}
```

### 6.2 任务列表 UI

```jsx
// React 组件示例
function TaskList() {
  const [tasks, setTasks] = useState([])

  useEffect(() => {
    // 订阅 WebSocket
    const ws = new WebSocket('ws://openclaw/ws')
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      setTasks(prev => updateTask(prev, message))
    }

    return () => ws.close()
  }, [])

  const handleContinue = (taskId, sessionId) => {
    // 发送继续会话任务
    api.sendTask({
      type: 'SESSION_CONTINUE',
      sessionId,
      prompt: '继续开发'
    })
  }

  const handlePause = (sessionId) => {
    api.sendTask({
      type: 'SESSION_PAUSE',
      sessionId
    })
  }

  return (
    <div>
      {tasks.map(task => (
        <TaskCard
          key={task.id}
          task={task}
          onContinue={() => handleContinue(task.id, task.sessionId)}
          onPause={() => handlePause(task.sessionId)}
        />
      ))}
    </div>
  )
}
```

---

## 7. 错误处理

### 7.1 任务失败重试

```javascript
async function sendTaskWithRetry(taskData, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const task = await createTask(taskData)
      const result = await waitForCompletion(task.id)

      if (result.status === 'SUCCESS') {
        return result
      }

      if (result.status === 'FAILED') {
        console.log(`Task failed, retry ${i + 1}/${maxRetries}`)
        await sleep(2000 * (i + 1)) // 指数退避
      }
    } catch (error) {
      console.error(`Error sending task: ${error.message}`)
      if (i === maxRetries - 1) throw error
    }
  }

  throw new Error('Max retries exceeded')
}
```

### 7.2 Session 不存在处理

```javascript
async function handleSessionNotFound(projectId) {
  // Session 不存在，重新创建
  console.log(`Session not found for ${projectId}, recreating...`)

  const project = await db.projects.findById(projectId)

  const task = await createTask({
    nodeId: 'node-001',
    type: 'EXECUTE',
    prompt: `恢复项目 ${project.name} 的开发`,
    metadata: {
      projectType: 'existing',
      projectRoot: project.root,
      workingDirectory: project.root
    }
  })

  const result = await waitForCompletion(task.id)
  return result.sessionId
}
```

---

## 8. 最佳实践

### 8.1 Session 管理

1. **保存 sessionId** - 每次 EXECUTE 任务完成后保存返回的 sessionId
2. **定期列出 Session** - 使用 SESSION_LIST 定期同步状态
3. **锁定重要项目** - 长期项目使用 SESSION_LOCK 防止误删
4. **显式删除** - 不再需要的 Session 使用 SESSION_DELETE 显式删除

### 8.2 任务下发

1. **合理设置 timeout** - 根据任务复杂度设置合适的超时时间
2. **使用 hooks** - 配置 hooks 接收实时通知
3. **重试机制** - 网络问题导致的失败使用重试
4. **错误处理** - 处理 Session 不存在、节点离线等情况

### 8.3 多项目管理

```javascript
class MultiProjectManager {
  constructor() {
    this.projectSessions = new Map() // projectId -> sessionId
  }

  async switchProject(projectId) {
    const sessionId = this.projectSessions.get(projectId)

    if (!sessionId) {
      // 创建新 Session
      const task = await this.createTask({
        type: 'EXECUTE',
        metadata: { projectRoot: this.getProjectRoot(projectId) }
      })
      const result = await this.waitForCompletion(task.id)
      this.projectSessions.set(projectId, result.sessionId)
      return result.sessionId
    }

    return sessionId
  }

  async executeInProject(projectId, prompt) {
    const sessionId = await this.switchProject(projectId)

    return this.createTask({
      type: 'SESSION_CONTINUE',
      sessionId,
      prompt
    })
  }
}
```

---

## 9. 配置文件

### 9.1 ClawNode 环境配置

```bash
# .env
OPENCLAW_URL=http://openclaw-server:8080
NODE_ID=node-001
NODE_SECRET=your-secret-key
POLL_INTERVAL=5000
HOOK_PORT=3001
EXEC_TIMEOUT=300000
LOG_LEVEL=info
```

### 9.2 OpenClaw 节点配置

```yaml
# config/nodes.yaml
nodes:
  - id: node-001
    name: 开发节点 1
    type: claw-node
    status: active
    callbackUrl: http://claw-node-host:3001/api/callbacks
    pollInterval: 5000
    maxTimeout: 600000
    supportedTypes:
      - EXECUTE
      - SESSION_CONTINUE
      - SESSION_PAUSE
      - SESSION_RESUME
      - SESSION_DELETE
      - SESSION_LOCK
      - SESSION_UNLOCK
      - SESSION_LIST
      - QUERY
```

---

## 10. 相关文档

- `SESSION_MANAGEMENT.md` - Session 管理详细文档
- `TASK_EXAMPLES.md` - 任务下发示例
- `PRD_FLOW.md` - PRD 驱动开发流程
- `SESSION_QUICK_REFERENCE.md` - 快速参考
