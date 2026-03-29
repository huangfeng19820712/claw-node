# ClawNode Session 管理方案

## 概述

ClawNode 提供完整的 Session 生命周期管理，由 OpenClaw 通过任务指令**完全控制**。Session 不会自动删除，必须显式发送删除指令。

## 设计原则

1. **显式控制** - Session 创建、继续、删除完全由 OpenClaw 控制
2. **不会自动清理** - Session 默认 `autoCleanup=false`，需要显式删除
3. **状态持久化** - Session 状态可以导出/导入，支持重启恢复
4. **上下文关联** - Session 可关联项目根目录、PRD 路径等上下文

---

## Session 状态

| 状态 | 说明 | 能否继续 | 能否删除 |
|------|------|----------|----------|
| `active` | 活跃，可以接收消息 | ✅ | ✅ |
| `paused` | 暂停，等待用户输入 | ❌（需先恢复） | ✅ |
| `locked` | 锁定，防止误删 | ✅ | ❌（需先解锁） |
| `closed` | 已关闭，不删除记录 | ❌ | ✅ |

---

## 任务类型

### 1. EXECUTE - 执行任务（带 PRD 文件）

**用途**: 执行开发任务，自动创建或复用 Session

**OpenClaw 下发格式**:
```json
{
  "id": "task-001",
  "type": "EXECUTE",
  "prompt": "根据 PRD 文件创建新项目",
  "prdPath": "/path/to/prd.md",
  "metadata": {
    "projectType": "new",
    "targetDirectory": "/tmp/new-project"
  },
  "sessionId": "optional-existing-session-id"
}
```

**处理逻辑**:
- 如果提供 `sessionId`：复用现有 Session
- 如果没有提供：创建新 Session（`autoCleanup=false`）
- 执行完成后 Session 保持活跃

### 2. SESSION_CONTINUE - 继续会话

**用途**: 向现有 Session 发送新消息（多轮对话）

**OpenClaw 下发格式**:
```json
{
  "id": "task-002",
  "type": "SESSION_CONTINUE",
  "sessionId": "session-abc-123",
  "prompt": "接下来请添加用户认证功能"
}
```

**处理逻辑**:
- 恢复 Session（如果是 paused 状态）
- 使用 `--continue` 参数调用 Claude Code
- 保持 Session 活跃

### 3. SESSION_PAUSE - 暂停会话

**用途**: 暂停 Session，等待用户输入

**OpenClaw 下发格式**:
```json
{
  "id": "task-003",
  "type": "SESSION_PAUSE",
  "sessionId": "session-abc-123"
}
```

**处理逻辑**:
- 将 Session 状态改为 `paused`
- Session 不会被删除

### 4. SESSION_RESUME - 恢复会话

**用途**: 恢复暂停的 Session

**OpenClaw 下发格式**:
```json
{
  "id": "task-004",
  "type": "SESSION_RESUME",
  "sessionId": "session-abc-123"
}
```

**处理逻辑**:
- 将 Session 状态从 `paused` 改为 `active`

### 5. SESSION_DELETE - 删除会话（唯一删除方式）

**用途**: 显式删除 Session

**OpenClaw 下发格式**:
```json
{
  "id": "task-005",
  "type": "SESSION_DELETE",
  "sessionId": "session-abc-123"
}
```

**处理逻辑**:
- 删除 Session 记录
- 如果 Session 是 `locked` 状态，需要 `autoCleanup=true` 强制删除

### 6. SESSION_LOCK - 锁定会话

**用途**: 防止 Session 被误删

**OpenClaw 下发格式**:
```json
{
  "id": "task-006",
  "type": "SESSION_LOCK",
  "sessionId": "session-abc-123"
}
```

**处理逻辑**:
- 将 Session 状态改为 `locked`
- `autoCleanup` 设为 `false`

### 7. SESSION_UNLOCK - 解锁会话

**用途**: 解锁 Session

**OpenClaw 下发格式**:
```json
{
  "id": "task-007",
  "type": "SESSION_UNLOCK",
  "sessionId": "session-abc-123"
}
```

**处理逻辑**:
- 将 Session 状态从 `locked` 改为 `active`

### 8. SESSION_LIST - 列出所有会话

**用途**: 查询所有 Session 状态

**OpenClaw 下发格式**:
```json
{
  "id": "task-008",
  "type": "SESSION_LIST"
}
```

**返回格式**:
```json
{
  "status": "SUCCESS",
  "output": {
    "sessions": [
      {
        "id": "session-abc-123",
        "taskId": "task-001",
        "status": "active",
        "createdAt": "2026-03-25T10:00:00.000Z",
        "lastActivityAt": "2026-03-25T10:30:00.000Z",
        "messageCount": 15,
        "projectRoot": "/tmp/new-project",
        "projectType": "new",
        "isLocked": false
      }
    ],
    "total": 1
  }
}
```

---

## 完整流程示例

### 场景 A：新项目开发（多轮对话）

```
┌─────────────┐
│ OpenClaw    │
└──────┬──────┘
       │
       │ 1. 下发 PRD 任务
       │ {
       │   "type": "EXECUTE",
       │   "prompt": "创建新的 Express 项目...",
       │   "prdPath": "/prd/new-project.md",
       │   "metadata": {
       │     "projectType": "new",
       │     "targetDirectory": "/tmp/express-app"
       │   }
       │ }
       ▼
┌─────────────┐
│ ClawNode    │
│ - 创建 Session (autoCleanup=false)
│ - 执行 Claude Code
│ - 创建项目文件
└──────┬──────┘
       │
       │ 回调：任务完成
       │ 返回 sessionId: session-abc-123
       ▼
┌─────────────┐
│ OpenClaw    │
│ 保存 sessionId
└──────┬──────┘
       │
       │ 2. 继续会话（添加新功能）
       │ {
       │   "type": "SESSION_CONTINUE",
       │   "sessionId": "session-abc-123",
       │   "prompt": "现在添加用户认证功能"
       │ }
       ▼
┌─────────────┐
│ ClawNode    │
│ - 复用 Session
│ - 继续执行
└──────┬──────┘
       │
       │ 回调：功能完成
       ▼
┌─────────────┐
│ OpenClaw    │
└──────┬──────┘
       │
       │ 3. 用户查看 Session 列表
       │ {
       │   "type": "SESSION_LIST"
       │ }
       ▼
┌─────────────┐
│ ClawNode    │
│ 返回：
│ sessions: [
│   { id: "session-abc-123", status: "active" }
│ ]
└──────┬──────┘
       │
       │ 4. 锁定 Session（防止误删）
       │ {
       │   "type": "SESSION_LOCK",
       │   "sessionId": "session-abc-123"
       │ }
       ▼
┌─────────────┐
│ ClawNode    │
│ 状态：active → locked
└──────┬──────┘
       │
       │ ... 会话持续 ...
       │
       │ 5. 最终删除 Session
       │ {
       │   "type": "SESSION_DELETE",
       │   "sessionId": "session-abc-123"
       │ }
       ▼
┌─────────────┐
│ ClawNode    │
│ 删除 Session
└─────────────┘
```

### 场景 B：现有项目开发

```
┌─────────────┐
│ OpenClaw    │
└──────┬──────┘
       │
       │ 1. 下发任务（带项目上下文）
       │ {
       │   "type": "EXECUTE",
       │   "prompt": "添加新的 API 端点",
       │   "metadata": {
       │     "projectType": "existing",
       │     "projectRoot": "/home/user/my-app",
       │     "workingDirectory": "/home/user/my-app"
       │   }
       │ }
       ▼
┌─────────────┐
│ ClawNode    │
│ - 创建 Session（关联项目根目录）
│ - 在项目目录执行
└──────┬──────┘
       │
       │ 2. 暂停 Session（等待用户确认）
       │ {
       │   "type": "SESSION_PAUSE",
       │   "sessionId": "session-xyz-789"
       │ }
       ▼
┌─────────────┐
│ ClawNode    │
│ 状态：active → paused
└──────┬──────┘
       │
       │ 3. 用户确认后恢复
       │ {
       │   "type": "SESSION_RESUME",
       │   "sessionId": "session-xyz-789"
       │ }
       ▼
┌─────────────┐
│ ClawNode    │
│ 状态：paused → active
│ 继续执行
└──────┬──────┘
```

---

## Session 数据结构

```typescript
// Session 状态
enum SessionStatus {
  ACTIVE = 'active',      // 活跃，可以继续消息
  PAUSED = 'paused',      // 暂停，等待用户输入
  LOCKED = 'locked',      // 锁定，不允许自动关闭
  CLOSED = 'closed'       // 已关闭
}

// Session 上下文
interface SessionContext {
  projectRoot?: string        // 项目根目录
  projectType?: 'new' | 'existing'
  prdPath?: string            // PRD 文件路径
  workingDirectory?: string   // 工作目录
  claudeSessionId?: string    // Claude Code 内部 session ID
  metadata?: Record<string, unknown>
}

// Session 定义
interface Session {
  id: string
  taskId: string
  status: SessionStatus
  createdAt: string
  lastActivityAt: string
  messageCount: number
  context?: SessionContext
  autoCleanup?: boolean     // 是否允许自动清理（默认 false）
}
```

---

## API 总结

| 任务类型 | 需要 sessionId | 创建 Session | 删除 Session | 说明 |
|----------|---------------|--------------|--------------|------|
| `EXECUTE` | 可选 | ✅（如果没有提供） | ❌ | 执行任务 |
| `SESSION_CONTINUE` | 必需 | ❌ | ❌ | 继续会话 |
| `SESSION_PAUSE` | 必需 | ❌ | ❌ | 暂停会话 |
| `SESSION_RESUME` | 必需 | ❌ | ❌ | 恢复会话 |
| `SESSION_DELETE` | 必需 | ❌ | ✅ | 删除会话 |
| `SESSION_LOCK` | 必需 | ❌ | ❌ | 锁定会话 |
| `SESSION_UNLOCK` | 必需 | ❌ | ❌ | 解锁会话 |
| `SESSION_LIST` | 不需要 | ❌ | ❌ | 列出会话 |

---

## 最佳实践

### 1. 新项目开发

```javascript
// 1. 创建任务（自动创建 Session）
const task1 = {
  type: 'EXECUTE',
  prompt: '创建新项目',
  metadata: { projectType: 'new' }
}

// 2. 保存返回的 sessionId
const sessionId = response.sessionId

// 3. 继续会话
const task2 = {
  type: 'SESSION_CONTINUE',
  sessionId: sessionId,
  prompt: '添加用户认证'
}

// 4. 锁定重要 Session
const lockTask = {
  type: 'SESSION_LOCK',
  sessionId: sessionId
}

// 5. 完成后删除
const deleteTask = {
  type: 'SESSION_DELETE',
  sessionId: sessionId
}
```

### 2. 现有项目开发

```javascript
// 1. 指定项目上下文
const task = {
  type: 'EXECUTE',
  prompt: '修改现有代码',
  metadata: {
    projectType: 'existing',
    projectRoot: '/home/user/my-app',
    workingDirectory: '/home/user/my-app'
  }
}

// 2. 暂停等待确认
const pauseTask = {
  type: 'SESSION_PAUSE',
  sessionId: sessionId
}

// 3. 用户确认后恢复
const resumeTask = {
  type: 'SESSION_RESUME',
  sessionId: sessionId
}
```

### 3. 会话管理

```javascript
// 定期列出会话
const listTask = { type: 'SESSION_LIST' }

// 查询特定会话
const queryTask = {
  type: 'QUERY',
  sessionId: sessionId
}

// 解锁并删除
await sendTask({ type: 'SESSION_UNLOCK', sessionId })
await sendTask({ type: 'SESSION_DELETE', sessionId })
```

---

## 错误处理

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `sessionId is required` | 缺少 sessionId | 检查任务是否包含 sessionId |
| `Session not found` | Session 不存在 | 确认 sessionId 是否正确 |
| `Session is locked` | Session 被锁定 | 先发送 `SESSION_UNLOCK` |
| `Cannot resume paused session` | Session 不是 paused 状态 | 检查当前状态 |

---

## 状态转换图

```
                    ┌─────────┐
                    │  创建   │
                    └────┬────┘
                         │
                         ▼
                    ┌─────────┐
          ┌──────── │ active  │ ────────┐
          │ 恢复    └────┬────┘         │ 暂停
          │             │               │
          │             │ 锁定          │
          │             ▼               │
          │        ┌─────────┐          │
          │ 解锁   │ locked  │          │
          │        └────┬────┘          │
          │             │               │
          │             │ 关闭          │
          │             ▼               │
          │        ┌─────────┐          │
          └────────│ paused  │ ◀────────┘
                   └────┬────┘
                        │
                        │ 删除
                        ▼
                   ┌─────────┐
                   │ deleted │
                   └─────────┘
```

---

## 相关文件

- `src/types.ts` - Session 类型定义
- `src/modules/session-manager.ts` - Session 管理器实现
- `src/index.ts` - ClawNode 主类（任务处理逻辑）
- `src/modules/executor.ts` - 执行器（支持 Session）
