# OpenClaw 任务下发示例

## 概述

本文档展示 OpenClaw 如何向 ClawNode 下发不同类型的任务，特别是 PRD 文件驱动的开发任务。

---

## 任务类型

| 类型 | 用途 | Session 行为 |
|------|------|-------------|
| `EXECUTE` | 执行开发任务 | 自动创建或复用 Session |
| `SESSION_CONTINUE` | 继续会话 | 使用现有 Session |
| `SESSION_PAUSE` | 暂停会话 | 改变状态为 paused |
| `SESSION_RESUME` | 恢复会话 | 改变状态为 active |
| `SESSION_DELETE` | 删除会话 | 删除 Session 记录 |
| `SESSION_LOCK` | 锁定会话 | 防止误删 |
| `SESSION_LIST` | 列出会话 | 查询所有 Session |

---

## 场景 1：新项目开发（完整流程）

### 步骤 1：下发 PRD 任务

```json
{
  "id": "task-new-project-001",
  "type": "EXECUTE",
  "prompt": "请根据以下 PRD 创建一个新的 Node.js 项目：\n\n# 项目需求\n创建一个博客系统后端，包含以下功能：\n1. 用户注册/登录\n2. 文章 CRUD\n3. 评论功能\n4. 标签分类\n\n技术栈：Node.js + Express + MongoDB",
  "prdPath": "/path/to/prd-blog-backend.md",
  "metadata": {
    "projectType": "new",
    "targetDirectory": "/home/user/projects/blog-backend",
    "techStack": ["nodejs", "express", "mongodb"]
  },
  "timeout": 600000,
  "hooks": {
    "onStart": "http://openclaw/api/hooks/start",
    "onOutput": "http://openclaw/api/hooks/output",
    "onComplete": "http://openclaw/api/hooks/complete",
    "onError": "http://openclaw/api/hooks/error"
  }
}
```

**ClawNode 处理**:
1. 创建新 Session（`autoCleanup=false`）
2. 在项目目录执行 Claude Code
3. 创建项目结构、安装依赖、生成代码

**返回**:
```json
{
  "status": "SUCCESS",
  "output": "项目创建完成...",
  "sessionId": "session-abc-123"
}
```

### 步骤 2：继续会话（添加功能）

```json
{
  "id": "task-continue-002",
  "type": "SESSION_CONTINUE",
  "sessionId": "session-abc-123",
  "prompt": "现在请添加 JWT 认证中间件，保护 API 端点"
}
```

**ClawNode 处理**:
1. 复用 Session `session-abc-123`
2. 使用 `--continue` 参数调用 Claude Code
3. 在现有项目基础上添加代码

### 步骤 3：暂停会话（等待确认）

```json
{
  "id": "task-pause-003",
  "type": "SESSION_PAUSE",
  "sessionId": "session-abc-123"
}
```

**ClawNode 处理**:
- Session 状态：`active` → `paused`

### 步骤 4：恢复会话

```json
{
  "id": "task-resume-004",
  "type": "SESSION_RESUME",
  "sessionId": "session-abc-123",
  "prompt": "用户确认继续，请完成剩余的 API 开发"
}
```

**ClawNode 处理**:
- Session 状态：`paused` → `active`
- 继续执行

### 步骤 5：锁定会话（防止误删）

```json
{
  "id": "task-lock-005",
  "type": "SESSION_LOCK",
  "sessionId": "session-abc-123"
}
```

**ClawNode 处理**:
- Session 状态：`active` → `locked`
- `autoCleanup` 设为 `false`

### 步骤 6：查询会话状态

```json
{
  "id": "task-query-006",
  "type": "QUERY",
  "sessionId": "session-abc-123"
}
```

**返回**:
```json
{
  "status": "SUCCESS",
  "output": {
    "type": "session_info",
    "session": {
      "id": "session-abc-123",
      "taskId": "task-new-project-001",
      "status": "locked",
      "createdAt": "2026-03-25T10:00:00.000Z",
      "lastActivityAt": "2026-03-25T11:30:00.000Z",
      "messageCount": 28,
      "context": {
        "projectType": "new",
        "projectRoot": "/home/user/projects/blog-backend",
        "prdPath": "/path/to/prd-blog-backend.md"
      },
      "isLocked": true
    }
  }
}
```

### 步骤 7：列出所有会话

```json
{
  "id": "task-list-007",
  "type": "SESSION_LIST"
}
```

**返回**:
```json
{
  "status": "SUCCESS",
  "output": {
    "sessions": [
      {
        "id": "session-abc-123",
        "taskId": "task-new-project-001",
        "status": "locked",
        "projectType": "new",
        "projectRoot": "/home/user/projects/blog-backend",
        "messageCount": 28,
        "isLocked": true
      },
      {
        "id": "session-xyz-789",
        "taskId": "task-existing-project-001",
        "status": "active",
        "projectType": "existing",
        "projectRoot": "/home/user/projects/my-app",
        "messageCount": 5,
        "isLocked": false
      }
    ],
    "total": 2
  }
}
```

### 步骤 8：解锁并删除会话

```json
// 先解锁
{
  "id": "task-unlock-008",
  "type": "SESSION_UNLOCK",
  "sessionId": "session-abc-123"
}

// 再删除
{
  "id": "task-delete-009",
  "type": "SESSION_DELETE",
  "sessionId": "session-abc-123"
}
```

---

## 场景 2：现有项目开发

### 步骤 1：下发任务（带项目上下文）

```json
{
  "id": "task-existing-001",
  "type": "EXECUTE",
  "prompt": "在当前项目中添加一个新的 API 端点：\n1. GET /api/users/:id - 获取用户详情\n2. PUT /api/users/:id - 更新用户信息\n3. DELETE /api/users/:id - 删除用户\n\n请确保遵循现有的代码风格和架构",
  "metadata": {
    "projectType": "existing",
    "projectRoot": "/home/user/projects/my-app",
    "workingDirectory": "/home/user/projects/my-app"
  },
  "timeout": 300000
}
```

**ClawNode 处理**:
1. 创建 Session，关联项目上下文
2. 在项目目录执行
3. 读取现有代码，理解结构
4. 添加新的 API 端点

### 步骤 2：暂停等待确认（代码审查）

```json
{
  "id": "task-pause-review",
  "type": "SESSION_PAUSE",
  "sessionId": "session-existing-xyz"
}
```

此时 Session 处于暂停状态，等待用户代码审查。

### 步骤 3：用户确认后继续

```json
{
  "id": "task-continue-review",
  "type": "SESSION_RESUME",
  "sessionId": "session-existing-xyz",
  "prompt": "代码审查通过，请继续完成单元测试"
}
```

---

## 场景 3：多项目并行开发

### 项目 A - 创建 Session

```json
{
  "id": "task-project-a-001",
  "type": "EXECUTE",
  "prompt": "为项目 A 开发新功能...",
  "metadata": {
    "projectType": "existing",
    "projectRoot": "/home/user/projects/project-a"
  }
}
```

**返回**: `sessionId: "session-project-a-001"`

### 项目 B - 创建 Session

```json
{
  "id": "task-project-b-001",
  "type": "EXECUTE",
  "prompt": "为项目 B 修复 bug...",
  "metadata": {
    "projectType": "existing",
    "projectRoot": "/home/user/projects/project-b"
  }
}
```

**返回**: `sessionId: "session-project-b-001"`

### 切换到项目 A

```json
{
  "id": "task-project-a-002",
  "type": "SESSION_CONTINUE",
  "sessionId": "session-project-a-001",
  "prompt": "继续开发项目 A 的下一个功能"
}
```

### 切换到项目 B

```json
{
  "id": "task-project-b-002",
  "type": "SESSION_CONTINUE",
  "sessionId": "session-project-b-001",
  "prompt": "继续修复项目 B 的下一个 bug"
}
```

---

## 场景 4：PRD 文件驱动开发

### PRD 文件内容示例

```markdown
# PRD: 博客系统后端

## 项目概述
创建一个博客系统后端 API

## 功能需求
1. 用户管理
   - 注册/登录
   - JWT 认证
2. 文章管理
   - CRUD 操作
   - 草稿/发布状态
3. 评论系统
   - 文章评论
   - 评论回复

## 技术栈
- Node.js 18+
- Express 4.x
- MongoDB + Mongoose
- JWT 认证

## API 设计
POST   /api/auth/register  - 注册
POST   /api/auth/login     - 登录
GET    /api/articles       - 获取文章列表
POST   /api/articles       - 创建文章
...
```

### 下发 PRD 任务

```json
{
  "id": "task-prd-001",
  "type": "EXECUTE",
  "prompt": "请实现这个 PRD 中描述的博客系统后端",
  "prdPath": "/path/to/prd-blog.md",
  "metadata": {
    "projectType": "new",
    "targetDirectory": "/home/user/projects/blog-backend",
    "techStack": ["nodejs", "express", "mongodb", "jwt"]
  },
  "timeout": 900000
}
```

### ClawNode 处理流程

```
1. 创建 Session
   └─ context: {
        prdPath: "/path/to/prd-blog.md",
        projectType: "new",
        targetDirectory: "/home/user/projects/blog-backend"
      }

2. 读取 PRD 文件
   └─ Claude Code 分析需求

3. 执行开发
   ├─ 创建项目结构
   ├─ 安装依赖
   ├─ 实现用户认证
   ├─ 实现文章 CRUD
   ├─ 实现评论系统
   └─ 编写测试

4. 完成任务
   └─ Session 保持活跃，等待后续指令
```

---

## 任务下发工具类

```javascript
class OpenClawTaskSender {
  constructor(openClawUrl, nodeId) {
    this.openClawUrl = openClawUrl
    this.nodeId = nodeId
    this.sessions = new Map() // 保存的 Session
  }

  // 发送 PRD 任务（新项目）
  async sendPRDTask(prompt, prdPath, metadata) {
    const task = {
      type: 'EXECUTE',
      prompt,
      prdPath,
      metadata: {
        ...metadata,
        projectType: 'new'
      },
      timeout: metadata.timeout || 600000
    }

    const response = await this.sendTask(task)
    if (response.sessionId) {
      this.sessions.set(metadata.targetDirectory, response.sessionId)
    }
    return response
  }

  // 发送 PRD 任务（现有项目）
  async sendExistingProjectTask(prompt, projectRoot, metadata = {}) {
    const task = {
      type: 'EXECUTE',
      prompt,
      metadata: {
        ...metadata,
        projectType: 'existing',
        projectRoot,
        workingDirectory: projectRoot
      },
      timeout: metadata.timeout || 300000
    }

    const response = await this.sendTask(task)
    if (response.sessionId) {
      this.sessions.set(projectRoot, response.sessionId)
    }
    return response
  }

  // 继续会话
  async continueSession(sessionId, prompt) {
    return this.sendTask({
      type: 'SESSION_CONTINUE',
      sessionId,
      prompt
    })
  }

  // 暂停会话
  async pauseSession(sessionId) {
    return this.sendTask({
      type: 'SESSION_PAUSE',
      sessionId
    })
  }

  // 恢复会话
  async resumeSession(sessionId, prompt) {
    return this.sendTask({
      type: 'SESSION_RESUME',
      sessionId,
      prompt
    })
  }

  // 锁定会话
  async lockSession(sessionId) {
    return this.sendTask({
      type: 'SESSION_LOCK',
      sessionId
    })
  }

  // 解锁会话
  async unlockSession(sessionId) {
    return this.sendTask({
      type: 'SESSION_UNLOCK',
      sessionId
    })
  }

  // 删除会话
  async deleteSession(sessionId) {
    return this.sendTask({
      type: 'SESSION_DELETE',
      sessionId
    })
  }

  // 列出所有会话
  async listSessions() {
    return this.sendTask({
      type: 'SESSION_LIST'
    })
  }

  // 发送任务
  async sendTask(task) {
    const response = await fetch(`${this.openClawUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...task,
        nodeId: this.nodeId
      })
    })
    return response.json()
  }

  // 获取 Session
  getSession(projectKey) {
    return this.sessions.get(projectKey)
  }
}

// 使用示例
const taskSender = new OpenClawTaskSender('http://openclaw:8080', 'node-1')

// 1. 新项目开发
const prdResponse = await taskSender.sendPRDTask(
  '创建博客系统后端',
  '/prd/blog.md',
  {
    targetDirectory: '/home/user/projects/blog-backend',
    techStack: ['nodejs', 'express', 'mongodb']
  }
)
console.log('Session ID:', prdResponse.sessionId)

// 2. 继续会话
await taskSender.continueSession(
  prdResponse.sessionId,
  '现在添加单元测试'
)

// 3. 锁定会话
await taskSender.lockSession(prdResponse.sessionId)

// 4. 列出所有会话
const sessions = await taskSender.listSessions()
console.log('Active sessions:', sessions)

// 5. 删除会话
await taskSender.unlockSession(prdResponse.sessionId)
await taskSender.deleteSession(prdResponse.sessionId)
```

---

## 错误处理

### 任务下发失败

```javascript
try {
  const response = await taskSender.sendPRDTask(...)
} catch (error) {
  console.error('任务下发失败:', error.message)
  // 重试逻辑
  await retryTask(task)
}
```

### Session 不存在

```javascript
const response = await taskSender.continueSession(sessionId, prompt)
if (response.status === 'FAILED' && response.error.includes('not found')) {
  // Session 不存在，创建新任务
  await taskSender.sendPRDTask(...)
}
```

### Session 被锁定

```javascript
const response = await taskSender.deleteSession(sessionId)
if (response.status === 'FAILED' && response.error.includes('locked')) {
  // 先解锁再删除
  await taskSender.unlockSession(sessionId)
  await taskSender.deleteSession(sessionId)
}
```

---

## 相关文件

- `SESSION_MANAGEMENT.md` - Session 管理详细文档
- `src/types.ts` - 任务类型定义
- `src/index.ts` - ClawNode 任务处理逻辑
