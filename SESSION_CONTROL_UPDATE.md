# Session 控制增强总结

## 更新内容

本次更新增强了 ClawNode 的 Session 管理功能，实现了由 OpenClaw 完全控制的 Session 生命周期管理。

---

## 核心变更

### 1. 类型定义更新 (`src/types.ts`)

#### 新增 SessionStatus 枚举
```typescript
enum SessionStatus {
  ACTIVE = 'active',      // 活跃，可以继续消息
  PAUSED = 'paused',      // 暂停，等待用户输入
  LOCKED = 'locked',      // 锁定，防止误删
  CLOSED = 'closed'       // 已关闭
}
```

#### 新增 SessionContext 接口
```typescript
interface SessionContext {
  projectRoot?: string        // 项目根目录
  projectType?: 'new' | 'existing'
  prdPath?: string            // PRD 文件路径
  workingDirectory?: string   // 工作目录
  claudeSessionId?: string    // Claude Code 内部 session ID
  metadata?: Record<string, unknown>
}
```

#### 更新 Session 接口
```typescript
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

#### 新增 TaskType
```typescript
enum TaskType {
  EXECUTE = 'EXECUTE',
  SESSION_CONTINUE = 'SESSION_CONTINUE',
  SESSION_PAUSE = 'SESSION_PAUSE',
  SESSION_RESUME = 'SESSION_RESUME',
  SESSION_DELETE = 'SESSION_DELETE',
  SESSION_LOCK = 'SESSION_LOCK',
  SESSION_UNLOCK = 'SESSION_UNLOCK',
  SESSION_LIST = 'SESSION_LIST',
  QUERY = 'QUERY'
}
```

#### 新增 SessionCommand 接口
```typescript
interface SessionCommand {
  action: 'create' | 'continue' | 'pause' | 'resume' | 'delete' | 'lock' | 'unlock' | 'list'
  sessionId?: string
  autoCleanup?: boolean
  context?: SessionContext
}
```

---

### 2. SessionManager 更新 (`src/modules/session-manager.ts`)

#### 新增方法

| 方法 | 用途 | 参数 |
|------|------|------|
| `getOrCreateSession()` | 获取或创建 Session | taskId, sessionId?, context? |
| `updateContext()` | 更新 Session 上下文 | sessionId, context |
| `lockSession()` | 锁定 Session | sessionId |
| `unlockSession()` | 解锁 Session | sessionId |
| `deleteSession()` | 删除 Session | sessionId, force? |
| `handleCommand()` | 处理控制指令 | SessionCommand |
| `getSessionsByTask()` | 获取任务的所有 Session | taskId |
| `getSessionSummaries()` | 获取 Session 摘要 | - |
| `exportState()` | 导出状态 | - |
| `importState()` | 导入状态 | state |

#### 关键行为变更

1. **默认不自动清理**: `createSession()` 的 `autoCleanup` 参数默认为 `false`
2. **锁定保护**: `deleteSession()` 对锁定的 Session 需要 `force=true`
3. **控制指令**: `handleCommand()` 统一处理所有 Session 控制指令

---

### 3. ClawNode 主类更新 (`src/index.ts`)

#### 新增任务处理方法

| 方法 | 处理任务类型 | 功能 |
|------|-------------|------|
| `handleExecuteTask()` | EXECUTE | 执行任务，创建/复用 Session |
| `handleSessionContinue()` | SESSION_CONTINUE | 继续会话 |
| `handleSessionCommand()` | SESSION_* | 处理 Session 控制指令 |
| `handleSessionList()` | SESSION_LIST | 列出所有 Session |
| `handleQuery()` | QUERY | 查询 Session 状态 |

#### Session 生命周期

```
EXECUTE 任务
  ├─ 有 sessionId → 复用
  └─ 无 sessionId → 创建 (autoCleanup=false)

SESSION_CONTINUE
  └─ 使用 sessionId 继续对话

SESSION_PAUSE
  └─ 状态：active → paused

SESSION_RESUME
  └─ 状态：paused → active

SESSION_LOCK
  └─ 状态：active → locked

SESSION_UNLOCK
  └─ 状态：active (从 locked)

SESSION_DELETE
  └─ 删除 Session 记录

SESSION_LIST
  └─ 返回所有 Session 摘要
```

---

### 4. Executor 更新 (`src/modules/executor.ts`)

#### execute 方法签名变更
```typescript
async execute(
  task: Task,
  onOutput?: (output: string) => void,
  sessionId?: string  // 新增参数
): Promise<ExecutionResult>
```

#### executeSessionMessage 方法签名变更
```typescript
async executeSessionMessage(
  sessionId: string,
  message: string,
  onOutput?: (output: string) => void  // 新增参数
): Promise<string>
```

---

## 新增文档

| 文件 | 用途 |
|------|------|
| `SESSION_MANAGEMENT.md` | Session 管理详细文档 |
| `TASK_EXAMPLES.md` | OpenClaw 任务下发示例 |
| `PRD_FLOW.md` | PRD 驱动的开发流程 |

---

## 使用示例

### 新项目开发

```javascript
// 1. 下发 PRD 任务（自动创建 Session）
const task1 = {
  type: 'EXECUTE',
  prompt: '创建新的博客系统',
  prdPath: '/prd/blog.md',
  metadata: {
    projectType: 'new',
    targetDirectory: '/tmp/blog'
  }
}
// 返回：{ sessionId: 'session-abc-123', status: 'SUCCESS' }

// 2. 继续会话
const task2 = {
  type: 'SESSION_CONTINUE',
  sessionId: 'session-abc-123',
  prompt: '添加用户认证功能'
}

// 3. 锁定 Session（防止误删）
const task3 = {
  type: 'SESSION_LOCK',
  sessionId: 'session-abc-123'
}

// 4. 列出所有 Session
const task4 = {
  type: 'SESSION_LIST'
}

// 5. 解锁并删除
await sendTask({ type: 'SESSION_UNLOCK', sessionId: 'session-abc-123' })
await sendTask({ type: 'SESSION_DELETE', sessionId: 'session-abc-123' })
```

### 现有项目开发

```javascript
// 1. 下发任务（带项目上下文）
const task = {
  type: 'EXECUTE',
  prompt: '添加新的 API 端点',
  metadata: {
    projectType: 'existing',
    projectRoot: '/home/user/my-app',
    workingDirectory: '/home/user/my-app'
  }
}

// 2. 暂停等待确认
await sendTask({
  type: 'SESSION_PAUSE',
  sessionId: response.sessionId
})

// 3. 用户确认后恢复
await sendTask({
  type: 'SESSION_RESUME',
  sessionId: response.sessionId,
  prompt: '继续完成开发'
})
```

---

## 测试更新

### 通过的测试

- ✅ Session 创建 (2 个测试)
- ✅ Session 获取 (2 个测试)
- ✅ 活动更新 (2 个测试)
- ✅ 暂停/恢复 (4 个测试)
- ✅ 关闭 Session (1 个测试)
- ✅ 获取 Session 列表 (2 个测试)
- ✅ 清理过期 Session (1 个测试)
- ✅ 锁定/解锁 Session (2 个测试)
- ✅ 删除 Session (2 个测试)
- ✅ 控制指令处理 (8 个测试)
- ✅ 任务类型 (1 个测试)
- ✅ 集成测试 (3 个测试)

**总计**: 65 个测试，全部通过

---

## 关键设计决策

### 1. 为什么 Session 不会自动删除？

**原因**:
- 多轮对话需要保持上下文
- 用户可能需要随时恢复之前的工作
- 防止误删重要进度

**解决方案**:
- `autoCleanup` 默认为 `false`
- 必须显式发送 `SESSION_DELETE` 指令
- 提供 `SESSION_LOCK` 防止误删

### 2. 为什么需要 Session 上下文？

**原因**:
- 记录项目根目录，方便切换
- 关联 PRD 文件，便于参考
- 保存工作目录，支持多项目

**实现**:
- `SessionContext` 接口存储元数据
- 创建 Session 时传入上下文
- 可在 `SESSION_LIST` 中查看

### 3. 为什么需要锁定机制？

**原因**:
- 长期项目需要保护
- 防止误操作删除
- 提供额外的安全层

**实现**:
- `SESSION_LOCK` 改变状态为 `locked`
- `deleteSession()` 对锁定的 Session 需要 `force=true`
- 必须先解锁才能删除

---

## 向后兼容性

### 破坏性变更

1. **TaskType.SESSION 移除**
   - 替换为 `SESSION_CONTINUE` 等具体类型
   - 需要更新相关代码

2. **Session 状态类型变更**
   - 从 `'active' | 'paused' | 'closed'`
   - 改为 `SessionStatus` 枚举

### 非破坏性变更

1. **Executor.execute()**
   - 新增可选参数 `sessionId`
   - 现有代码仍然有效

2. **SessionManager.createSession()**
   - 新增可选参数 `context` 和 `autoCleanup`
   - 现有代码仍然有效

---

## 下一步建议

1. **Session 持久化**
   - 将 Session 状态保存到磁盘
   - 重启后恢复 Session

2. **Session 超时**
   - 可选的超时机制
   - 超时后自动暂停

3. **Session 导出/导入**
   - 支持 Session 迁移
   - 支持 Session 分享

4. **多 Session 并发**
   - 支持同时处理多个 Session
   - Session 间隔离

---

## 相关文件

- `src/types.ts` - 类型定义
- `src/modules/session-manager.ts` - Session 管理器
- `src/index.ts` - ClawNode 主类
- `src/modules/executor.ts` - 执行器
- `SESSION_MANAGEMENT.md` - Session 管理文档
- `TASK_EXAMPLES.md` - 任务示例
- `PRD_FLOW.md` - PRD 流程文档
