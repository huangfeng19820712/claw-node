# ClawNode 架构说明

## 概述

ClawNode 是一个 Claude Code 执行节点代理，接收 OpenClaw 调度中心的任务指令，调用 Claude Code 执行开发任务，并通过消息渠道通知结果。

---

## 架构模式

ClawNode 支持三种运行模式：

### 1. 推送模式（Push）

```
OpenClaw → HTTP POST → ClawNode → Claude Code → 渠道通知
```

**特点**：
- 实时性高
- 资源消耗低
- 适合生产环境

**配置**：`RUN_MODE=push`

### 2. 轮询模式（Poll）

```
ClawNode → HTTP GET（轮询）→ OpenClaw → 获取任务 → Claude Code → 渠道通知
```

**特点**：
- 配置简单
- 有轮询延迟
- 适合测试环境

**配置**：`RUN_MODE=poll`

### 3. 混合模式（Hybrid）

```
同时支持推送和轮询
```

**特点**：
- 兼容性最好
- 默认模式

**配置**：`RUN_MODE=hybrid`（默认）

---

## 核心模块

```
┌─────────────────────────────────────────────────────────────────┐
│                         ClawNode                                │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ TaskPoller   │  │ TaskReceiver │  │ Executor     │          │
│  │ (轮询器)     │  │ (推送接收器)  │  │ (执行器)     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────┬────────┴─────────────────┘                   │
│                  │                                              │
│         ┌────────▼────────┐                                     │
│         │  SessionManager │  ┌──────────────┐                  │
│         │  (会话管理)     │  │ CallbackClient│                  │
│         └─────────────────┘  │ (回调客户端)  │                  │
│                              └───────┬──────┘                  │
│                                      │                          │
│  ┌──────────────┐           ┌────────▼────────┐                │
│  │ HookReceiver │           │ notify-openclaw │                │
│  │ (Hook 服务)    │──────────>│ (通知脚本)      │                │
│  └──────────────┘           └────────┬────────┘                │
│                                      │                          │
│                              ┌───────▼───────┐                  │
│                              │ openclaw CLI  │                  │
│                              └───────┬───────┘                  │
└──────────────────────────────────────┼──────────────────────────┘
                                       │
                                       ▼
                              ┌───────────────┐
                              │  消息渠道     │
                              │ - 钉钉        │
                              │ - 企业微信    │
                              │ - 飞书        │
                              │ - Telegram    │
                              └───────────────┘
```

### 模块说明

| 模块 | 文件 | 功能 |
|------|------|------|
| TaskPoller | `src/modules/task-poller.ts` | 轮询获取任务（轮询模式） |
| TaskReceiver | `src/modules/task-receiver.ts` | 接收推送任务（推送模式） |
| Executor | `src/modules/executor.ts` | 调用 Claude Code 执行任务 |
| SessionManager | `src/modules/session-manager.ts` | 管理 Session 生命周期 |
| CallbackClient | `src/modules/callback-client.ts` | 发送回调到 OpenClaw |
| HookReceiver | `src/modules/hook-receiver.ts` | 接收和处理 Hooks |
| notify-openclaw | `.claude/hooks/notify-openclaw.sh` | 发送通知到消息渠道 |

---

## 任务流程

### 完整任务生命周期

```
1. 任务创建 (OpenClaw)
   ↓
2. 任务下发 (推送/轮询)
   ↓
3. ClawNode 接收任务
   ↓
4. 发送开始回调 (onStart)
   ↓
5. 执行 Claude Code
   ↓
6. 实时输出回调 (onOutput)
   ↓
7. 任务完成
   ↓
8. 发送完成回调 (onComplete)
   ↓
9. Hook 触发通知
   ↓
10. 渠道收到通知
```

### 状态流转

```
PENDING → RUNNING → SUCCESS
              ↓
            FAILED
              ↓
            RETRY → RUNNING → SUCCESS
```

---

## Session 管理

### Session 状态

| 状态 | 说明 | 能否继续 | 能否删除 |
|------|------|----------|----------|
| `active` | 活跃 | ✅ | ✅ |
| `paused` | 暂停 | ❌（需先恢复） | ✅ |
| `locked` | 锁定 | ✅ | ❌（需先解锁） |
| `closed` | 已关闭 | ❌ | ✅ |

### Session 控制任务

| 任务类型 | 用途 |
|----------|------|
| `EXECUTE` | 执行任务（自动创建/复用 Session） |
| `SESSION_CONTINUE` | 继续会话 |
| `SESSION_PAUSE` | 暂停会话 |
| `SESSION_RESUME` | 恢复会话 |
| `SESSION_DELETE` | 删除会话 |
| `SESSION_LOCK` | 锁定会话 |
| `SESSION_UNLOCK` | 解锁会话 |
| `SESSION_LIST` | 列出会话 |
| `QUERY` | 查询状态 |

---

## Hooks 系统

### 配置的 Hook 事件

| 事件 | 脚本 | 功能 |
|------|------|------|
| SessionStart | session-init.sh | 会话初始化 |
| PreToolUse | security-check.sh | 安全检查 |
| PreToolUse | file-change-log.sh | 文件变更日志 |
| PermissionRequest | auto-permission.sh | 自动权限处理 |
| PostToolUse | command-audit.sh | 命令审计 |
| PostToolUse | file-change-report.sh | 文件变更报告 |
| PostToolUseFailure | error-handler.sh | 错误处理 |
| Stop | task-complete-check.sh | 任务完成检查 |
| Stop | notify-openclaw.sh | **发送通知到渠道** |
| StopFailure | notify-openclaw.sh | **发送失败通知** |
| SessionEnd | session-cleanup.sh | 会话清理 |

### notify-openclaw.sh 通知脚本

```bash
# 环境变量
OPENCLAW_BIN=/path/to/openclaw
NOTIFY_CHANNEL=telegram
NOTIFY_TARGET=@your-group

# 执行
echo '{"taskId": "001", "event": "complete", "data": {"status": "SUCCESS"}}' | bash notify-openclaw.sh

# 发送消息
openclaw message send --channel telegram --target @group --message "✅ 任务完成..."
```

---

## 配置说明

### 环境变量（.env）

```bash
# 基础配置
OPENCLAW_URL=http://openclaw-server:8080
NODE_ID=node-001
NODE_SECRET=your-secret-key

# 运行模式
RUN_MODE=hybrid  # push/poll/hybrid

# 端口配置
RECEIVER_PORT=3000  # 推送模式接收端口
HOOK_PORT=3001      # Hook 回调端口

# 超时配置
EXEC_TIMEOUT=300000  # 5 分钟

# 通知配置
OPENCLAW_BIN=/path/to/openclaw
NOTIFY_CHANNEL=telegram
NOTIFY_TARGET=@your-group
```

### 端口说明

| 端口 | 用途 | 模式 |
|------|------|------|
| 3000 | 任务接收（HTTP POST） | 推送模式 |
| 3001 | Hook 回调服务 | 所有模式 |

---

## 部署

### 快速启动

```bash
# 复制环境配置
cp .env.example .env

# 编辑配置
vim .env

# 安装依赖
npm install

# 构建
npm run build

# 启动
npm start
```

### 健康检查

```bash
# 检查服务状态
curl http://localhost:3000/health

# 检查节点状态
curl http://localhost:3000/api/status
```

### 测试推送

```bash
# 发送测试任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -H "X-Claw-Signature: sha256=$(echo -n '{"task":{"id":"test"}}'|sha256sum|cut -d' ' -f1)" \
  -d '{"task": {"id": "test-001", "type": "EXECUTE", "prompt": "Hello"}}'
```

---

## 相关文档

| 文档 | 用途 |
|------|------|
| `PUSH_MODE_DEPLOYMENT.md` | 推送模式部署指南 |
| `OPENCLAW_CHANNEL_INTEGRATION.md` | 渠道集成指南 |
| `SESSION_MANAGEMENT.md` | Session 管理 |
| `SESSION_QUICK_REFERENCE.md` | Session 快速参考 |
| `TASK_EXAMPLES.md` | 任务下发示例 |
| `PRD_FLOW.md` | PRD 驱动开发流程 |
