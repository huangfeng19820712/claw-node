# PRD 文件驱动的开发流程

## 概述

本文档详细说明从 OpenClaw 下发 PRD 文件到 ClawNode 执行开发的完整流程，包括新项目创建和现有项目开发两种场景。

---

## 核心概念

### Session 管理机制

```
┌─────────────────────────────────────────────────────────┐
│                  Session 生命周期管理                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  创建 → 活跃 → 暂停 ←→ 恢复 → 锁定 → 解锁 → 删除       │
│   │                                                      │
│   └────────────────────────────────────────────────────┘
│                    (不会自动删除)                        │
└─────────────────────────────────────────────────────────┘
```

**关键原则**:
1. Session 不会自动删除，必须显式发送 `SESSION_DELETE` 指令
2. 每个 Session 关联项目上下文（根目录、PRD 路径等）
3. 多轮对话通过 `sessionId` 保持上下文连续性

---

## 场景 A：新项目开发流程

### 流程图

```
OpenClaw                              ClawNode                            Claude Code
  │                                      │                                     │
  │ 1. EXECUTE 任务 (带 PRD)              │                                     │
  │ {                                    │                                     │
  │   type: "EXECUTE",                   │                                     │
  │   prompt: "创建新项目...",            │                                     │
  │   prdPath: "/prd/new-project.md",    │                                     │
  │   metadata: {                        │                                     │
  │     projectType: "new",              │                                     │
  │     targetDirectory: "/tmp/new-app"  │                                     │
  │   }                                  │                                     │
  │ }                                    │                                     │
  ├─────────────────────────────────────>│                                     │
  │                                      │                                     │
  │                                      │ 2. 创建 Session                      │
  │                                      │    autoCleanup=false                 │
  │                                      │    context: {                        │
  │                                      │      projectType: "new",             │
  │                                      │      prdPath: "/prd/...",            │
  │                                      │      targetDirectory: "/tmp/..."     │
  │                                      │    }                                 │
  │                                      │                                     │
  │                                      │ 3. 执行 Claude Code                  │
  │                                      │    claude -p "创建新项目..."         │
  │                                      ├────────────────────────────────────>│
  │                                      │                                     │
  │                                      │     SessionStart Hook                │
  │                                      │     - 记录会话开始                   │
  │                                      │     - 设置环境变量                   │
  │                                      │                                     │
  │                                      │     工具调用循环：                    │
  │                                      │     ┌──────────────────┐             │
  │                                      │     │ PreToolUse       │             │
  │                                      │     │ - 安全检查       │             │
  │                                      │     │ - 文件日志       │             │
  │                                      │     └────────┬─────────┘             │
  │                                      │              ▼                       │
  │                                      │     ┌──────────────────┐             │
  │                                      │     │ PermissionReq    │             │
  │                                      │     │ - 自动批准       │             │
  │                                      │     └────────┬─────────┘             │
  │                                      │              ▼                       │
  │                                      │     ┌──────────────────┐             │
  │                                      │     │ 执行工具         │             │
  │                                      │     │ - Bash           │             │
  │                                      │     │ - Write          │             │
  │                                      │     └────────┬─────────┘             │
  │                                      │              ▼                       │
  │                                      │     ┌──────────────────┐             │
  │                                      │     │ PostToolUse      │             │
  │                                      │     │ - 审计日志       │             │
  │                                      │     └──────────────────┘             │
  │                                      │                                     │
  │                                      │                                     │
  │ 4. onOutput 回调 (实时)               │                                     │
  │ <────────────────────────────────────│                                     │
  │   "创建项目目录..."                   │                                     │
  │   "初始化 npm..."                     │                                     │
  │   "安装依赖..."                       │                                     │
  │                                      │                                     │
  │                                      │ 5. 任务完成                          │
  │                                      │     status: SUCCESS                  │
  │                                      │     sessionId: "session-abc-123"     │
  │                                      │                                     │
  │ 6. onComplete 回调                   │                                     │
  │ <────────────────────────────────────│                                     │
  │   {                                  │                                     │
  │     status: "SUCCESS",               │                                     │
  │     output: "项目创建完成",           │                                     │
  │     sessionId: "session-abc-123"     │                                     │
  │   }                                  │                                     │
  │                                      │                                     │
  │ 7. 保存 sessionId                     │                                     │
  │                                      │                                     │
  │ 8. SESSION_CONTINUE (继续开发)        │                                     │
  │ {                                    │                                     │
  │   type: "SESSION_CONTINUE",          │                                     │
  │   sessionId: "session-abc-123",      │                                     │
  │   prompt: "添加用户认证功能"          │                                     │
  │ }                                    │                                     │
  ├─────────────────────────────────────>│                                     │
  │                                      │ 9. 复用 Session                      │
  │                                      │    使用 --continue 参数               │
  │                                      ├────────────────────────────────────>│
  │                                      │                                     │
  │ 10. onOutput 回调                    │                                     │
  │ <────────────────────────────────────│                                     │
  │                                      │                                     │
  │ 11. onComplete 回调                  │                                     │
  │ <────────────────────────────────────│                                     │
  │                                      │                                     │
  │ ... 多轮对话 ...                     │                                     │
  │                                      │                                     │
  │ 12. SESSION_LOCK (防止误删)          │                                     │
  │ {                                    │                                     │
  │   type: "SESSION_LOCK",              │                                     │
  │   sessionId: "session-abc-123"       │                                     │
  │ }                                    │                                     │
  ├─────────────────────────────────────>│                                     │
  │                                      │ 状态：active → locked                │
  │                                      │                                     │
  │ ... 长时间后 ...                     │                                     │
  │                                      │                                     │
  │ 13. SESSION_UNLOCK                   │                                     │
  ├─────────────────────────────────────>│                                     │
  │                                      │ 状态：locked → active                │
  │                                      │                                     │
  │ 14. SESSION_DELETE                   │                                     │
  │ {                                    │                                     │
  │   type: "SESSION_DELETE",            │                                     │
  │   sessionId: "session-abc-123"       │                                     │
  │ }                                    │                                     │
  ├─────────────────────────────────────>│                                     │
  │                                      │ 删除 Session                         │
  │                                      │                                     │
```

### 详细步骤说明

#### 步骤 1: 下发 PRD 任务

OpenClaw 发送任务到 ClawNode：

```json
{
  "id": "task-new-001",
  "type": "EXECUTE",
  "prompt": "请根据以下 PRD 创建一个新的 Node.js 博客系统：\n\n# 博客系统 PRD\n\n## 功能需求\n1. 用户注册/登录\n2. 文章 CRUD\n3. 评论系统\n\n## 技术栈\n- Node.js 18+\n- Express 4.x\n- MongoDB + Mongoose",
  "prdPath": "/path/to/prd-blog.md",
  "metadata": {
    "projectType": "new",
    "targetDirectory": "/home/user/projects/blog-backend",
    "techStack": ["nodejs", "express", "mongodb"]
  },
  "timeout": 600000
}
```

#### 步骤 2: ClawNode 创建 Session

```typescript
// src/index.ts - handleExecuteTask
const newSession = this.sessionManager.createSession(task.id, {
  projectRoot: task.metadata.targetDirectory,
  projectType: 'new',
  prdPath: task.prdPath,
  workingDirectory: task.metadata.targetDirectory,
  metadata: task.metadata
}, false) // autoCleanup = false，不会自动删除
```

#### 步骤 3-6: 执行任务

ClawNode 调用 Claude Code，在项目目录执行：
- 创建项目结构
- 安装依赖
- 生成代码文件
- 实时输出回调到 OpenClaw

#### 步骤 7: 保存 SessionId

OpenClaw 保存返回的 `sessionId`，用于后续继续对话。

#### 步骤 8-11: 继续会话

发送 `SESSION_CONTINUE` 任务，ClawNode 使用 `--continue` 参数调用 Claude Code，保持上下文连续。

#### 步骤 12: 锁定 Session

防止误删重要 Session，发送 `SESSION_LOCK` 任务。

#### 步骤 13-14: 解锁并删除

当项目完成后，先解锁再删除。

---

## 场景 B：现有项目开发流程

### 流程图

```
OpenClaw                              ClawNode                            Claude Code
  │                                      │                                     │
  │ 1. EXECUTE 任务 (现有项目)            │                                     │
  │ {                                    │                                     │
  │   type: "EXECUTE",                   │                                     │
  │   prompt: "添加新的 API 端点...",      │                                     │
  │   metadata: {                        │                                     │
  │     projectType: "existing",         │                                     │
  │     projectRoot: "/home/user/my-app",│                                     │
  │     workingDirectory: "/home/user/...│                                     │
  │   }                                  │                                     │
  │ }                                    │                                     │
  ├─────────────────────────────────────>│                                     │
  │                                      │                                     │
  │                                      │ 2. 创建 Session (关联现有项目)       │
  │                                      │    context: {                        │
  │                                      │      projectType: "existing",        │
  │                                      │      projectRoot: "/home/user/..."   │
  │                                      │    }                                 │
  │                                      │                                     │
  │                                      │ 3. 执行 Claude Code                  │
  │                                      │    claude -p "添加新的 API 端点..."  │
  │                                      │    --cd /home/user/my-app            │
  │                                      ├────────────────────────────────────>│
  │                                      │                                     │
  │                                      │     读取现有代码：                    │
  │                                      │     - Read: src/routes/user.js      │
  │                                      │     - Read: src/controllers/...     │
  │                                      │     - Read: src/models/User.js      │
  │                                      │                                     │
  │                                      │     修改代码：                        │
  │                                      │     - Edit: src/routes/user.js      │
  │                                      │     - Write: src/controllers/new.js │
  │                                      │                                     │
  │ 4. onOutput 回调                     │                                     │
  │ <────────────────────────────────────│                                     │
  │   "正在查看现有代码结构..."           │                                     │
  │   "创建新的控制器..."                 │                                     │
  │   "修改路由文件..."                   │                                     │
  │                                      │                                     │
  │ 5. onComplete 回调                   │                                     │
  │ <────────────────────────────────────│                                     │
  │   {                                  │                                     │
  │     status: "SUCCESS",               │                                     │
  │     output: "API 端点已添加",          │                                     │
  │     sessionId: "session-xyz-789",    │                                     │
  │     metadata: {                      │                                     │
  │       "modifiedFiles": [...],        │                                     │
  │       "createdFiles": [...]          │                                     │
  │     }                                │                                     │
  │   }                                  │                                     │
  │                                      │                                     │
  │ 6. SESSION_PAUSE (等待代码审查)      │                                     │
  │ {                                    │                                     │
  │   type: "SESSION_PAUSE",             │                                     │
  │   sessionId: "session-xyz-789"       │                                     │
  │ }                                    │                                     │
  ├─────────────────────────────────────>│                                     │
  │                                      │ 状态：active → paused                │
  │                                      │                                     │
  │ ... 用户进行代码审查 ...              │                                     │
  │                                      │                                     │
  │ 7. SESSION_RESUME                    │                                     │
  │ {                                    │                                     │
  │   type: "SESSION_RESUME",            │                                     │
  │   sessionId: "session-xyz-789",      │                                     │
  │   prompt: "代码审查通过，             │                                     │
  │              请继续编写单元测试"      │                                     │
  │ }                                    │                                     │
  ├─────────────────────────────────────>│                                     │
  │                                      │ 状态：paused → active                │
  │                                      │ 继续执行                             │
  │                                      ├────────────────────────────────────>│
  │                                      │                                     │
  │ 8. onComplete 回调                   │                                     │
  │ <────────────────────────────────────│                                     │
  │                                      │                                     │
```

---

## Session 状态转换

```
                    ┌────────────────┐
                    │   OpenClaw     │
                    │  下发创建任务   │
                    └───────┬────────┘
                            │
                            ▼
                    ┌────────────────┐
                    │  Session 创建   │
                    │ autoCleanup=false│
                    └───────┬────────┘
                            │
                            ▼
                    ┌────────────────┐
         ┌─────────│    active      │─────────┐
         │ 恢复    │   (活跃状态)    │  暂停   │
         │         └───────┬────────┘         │
         │                 │ 锁定             │
         │                 ▼                  │
         │         ┌────────────────┐         │
         │ 解锁    │    locked      │         │
         │         │   (锁定状态)    │         │
         │         └───────┬────────┘         │
         │                 │ 关闭             │
         │                 ▼                  │
         │         ┌────────────────┐         │
         └────────>│    paused      │<────────┘
                   │   (暂停状态)    │
                   └───────┬────────┘
                           │
                           │ 删除 (SESSION_DELETE)
                           ▼
                   ┌────────────────┐
                   │   deleted      │
                   │   (已删除)      │
                   └────────────────┘
```

---

## 任务类型与 Session 操作

| 任务类型 | Session 操作 | 需要 sessionId | 返回 sessionId |
|----------|-------------|---------------|---------------|
| `EXECUTE` | 创建或复用 | 可选 | ✅ |
| `SESSION_CONTINUE` | 继续消息 | ✅ | ✅ |
| `SESSION_PAUSE` | 暂停 | ✅ | ❌ |
| `SESSION_RESUME` | 恢复 | ✅ | ✅ |
| `SESSION_LOCK` | 锁定 | ✅ | ❌ |
| `SESSION_UNLOCK` | 解锁 | ✅ | ❌ |
| `SESSION_DELETE` | 删除 | ✅ | ❌ |
| `SESSION_LIST` | 查询 | ❌ | ❌ |

---

## 代码实现位置

### Session 管理

- `src/types.ts` - Session 类型定义
  - `SessionStatus` 枚举
  - `Session` 接口
  - `SessionContext` 接口
  - `SessionCommand` 接口

- `src/modules/session-manager.ts` - Session 管理器
  - `createSession()` - 创建 Session
  - `getSession()` - 获取 Session
  - `pauseSession()` - 暂停 Session
  - `resumeSession()` - 恢复 Session
  - `lockSession()` - 锁定 Session
  - `unlockSession()` - 解锁 Session
  - `deleteSession()` - 删除 Session
  - `handleCommand()` - 处理控制指令

### 任务处理

- `src/index.ts` - ClawNode 主类
  - `handleTask()` - 任务分发
  - `handleExecuteTask()` - EXECUTE 任务处理
  - `handleSessionContinue()` - SESSION_CONTINUE 任务处理
  - `handleSessionCommand()` - Session 控制指令处理
  - `handleSessionList()` - SESSION_LIST 任务处理

### 执行器

- `src/modules/executor.ts` - 执行器
  - `execute()` - 执行任务（支持 sessionId）
  - `executeSessionMessage()` - 执行 Session 消息

---

## 相关文件

- `SESSION_MANAGEMENT.md` - Session 管理详细文档
- `TASK_EXAMPLES.md` - 任务下发示例
- `HOOKS_CONFIG_PLAN.md` - Hooks 配置方案
- `HOOKS_DEPLOYMENT_REPORT.md` - Hooks 部署报告
