# Session 快速参考

## 任务类型速查表

| 任务类型 | 用途 | 需要 sessionId | 创建 Session | 删除 Session |
|----------|------|---------------|--------------|--------------|
| `EXECUTE` | 执行开发任务 | 可选 | ✅ | ❌ |
| `SESSION_CONTINUE` | 继续会话 | ✅ | ❌ | ❌ |
| `SESSION_PAUSE` | 暂停会话 | ✅ | ❌ | ❌ |
| `SESSION_RESUME` | 恢复会话 | ✅ | ❌ | ❌ |
| `SESSION_DELETE` | 删除会话 | ✅ | ❌ | ✅ |
| `SESSION_LOCK` | 锁定会话 | ✅ | ❌ | ❌ |
| `SESSION_UNLOCK` | 解锁会话 | ✅ | ❌ | ❌ |
| `SESSION_LIST` | 列出会话 | ❌ | ❌ | ❌ |
| `QUERY` | 查询状态 | 可选 | ❌ | ❌ |

---

## Session 状态

| 状态 | 说明 | 能否继续 | 能否删除 |
|------|------|----------|----------|
| `active` | 活跃 | ✅ | ✅ |
| `paused` | 暂停 | ❌（需先恢复） | ✅ |
| `locked` | 锁定 | ✅ | ❌（需先解锁） |
| `closed` | 已关闭 | ❌ | ✅ |

---

## 常用操作

### 新项目开发

```json
// 1. 创建任务（自动创建 Session）
{
  "type": "EXECUTE",
  "prompt": "创建新项目...",
  "metadata": {
    "projectType": "new",
    "targetDirectory": "/tmp/new-app"
  }
}

// 2. 继续会话
{
  "type": "SESSION_CONTINUE",
  "sessionId": "session-xxx",
  "prompt": "继续开发..."
}

// 3. 锁定（防止误删）
{
  "type": "SESSION_LOCK",
  "sessionId": "session-xxx"
}

// 4. 删除（先解锁）
{ "type": "SESSION_UNLOCK", "sessionId": "session-xxx" }
{ "type": "SESSION_DELETE", "sessionId": "session-xxx" }
```

### 现有项目开发

```json
// 1. 下发任务（带项目上下文）
{
  "type": "EXECUTE",
  "prompt": "添加新功能...",
  "metadata": {
    "projectType": "existing",
    "projectRoot": "/home/user/my-app"
  }
}

// 2. 暂停（等待确认）
{
  "type": "SESSION_PAUSE",
  "sessionId": "session-xxx"
}

// 3. 恢复
{
  "type": "SESSION_RESUME",
  "sessionId": "session-xxx",
  "prompt": "继续..."
}
```

### 查询会话

```json
// 列出所有会话
{ "type": "SESSION_LIST" }

// 查询特定会话
{
  "type": "QUERY",
  "sessionId": "session-xxx"
}
```

---

## 状态转换

```
创建 → active ←→ paused → locked → active
         ↓           ↓         ↓
       closed    closed    deleted
         ↓           ↓
       deleted   deleted
```

---

## 关键特性

1. **不会自动删除** - `autoCleanup` 默认为 `false`
2. **显式控制** - 必须发送 `SESSION_DELETE` 才删除
3. **锁定保护** - `locked` 状态需要 `force=true` 才能删除
4. **上下文关联** - Session 可关联项目根目录、PRD 路径等
5. **多轮对话** - 通过 `sessionId` 保持上下文连续

---

## API 完整示例

```javascript
// 创建 Session（通过 EXECUTE 任务）
const task1 = {
  type: 'EXECUTE',
  prompt: '创建项目',
  metadata: { projectType: 'new' }
}
// → { sessionId: 'session-abc', status: 'SUCCESS' }

// 继续会话
{
  type: 'SESSION_CONTINUE',
  sessionId: 'session-abc',
  prompt: '继续开发'
}

// 暂停
{ type: 'SESSION_PAUSE', sessionId: 'session-abc' }

// 恢复
{
  type: 'SESSION_RESUME',
  sessionId: 'session-abc',
  prompt: '继续'
}

// 锁定
{ type: 'SESSION_LOCK', sessionId: 'session-abc' }

// 解锁
{ type: 'SESSION_UNLOCK', sessionId: 'session-abc' }

// 删除
{ type: 'SESSION_DELETE', sessionId: 'session-abc' }

// 列出
{ type: 'SESSION_LIST' }

// 查询
{ type: 'QUERY', sessionId: 'session-abc' }
```

---

## 详细文档

- `SESSION_MANAGEMENT.md` - 完整 Session 管理文档
- `TASK_EXAMPLES.md` - 任务下发示例
- `PRD_FLOW.md` - PRD 驱动开发流程
- `SESSION_CONTROL_UPDATE.md` - 更新总结

---

## 错误处理

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `sessionId is required` | 缺少 sessionId | 添加 sessionId 到任务 |
| `Session not found` | Session 不存在 | 检查 sessionId 是否正确 |
| `Session is locked` | Session 被锁定 | 先发送 `SESSION_UNLOCK` |
| `Unknown action` | 无效的控制指令 | 检查 action 是否合法 |
