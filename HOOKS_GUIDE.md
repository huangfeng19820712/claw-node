# Claude Code Hooks 配置指南

## 概述

ClawNode 中的 Hooks 机制允许你在任务执行的关键节点接收回调通知。本文档说明了可用的 Hook 事件类型和配置方法。

## Hook 事件类型

ClawNode 支持以下 4 种 Hook 事件：

| 事件 | 触发时机 | 数据内容 |
|------|----------|----------|
| `onStart` | 任务开始执行时 | `{ taskId, nodeId, startedAt }` |
| `onOutput` | 有输出产生时 | `{ taskId, output }` |
| `onComplete` | 任务执行完成时 | `{ taskId, status, output, exitCode, completedAt }` |
| `onError` | 任务执行失败时 | `{ taskId, error }` |

## Hook 配置方式

### 方式 1: 任务级别配置（推荐）

在任务定义中配置 Hook URL：

```json
{
  "taskId": "task-123",
  "type": "EXECUTE",
  "prompt": "完成某项任务",
  "hooks": {
    "onStart": "http://your-server.com/hooks/start",
    "onOutput": "http://your-server.com/hooks/output",
    "onComplete": "http://your-server.com/hooks/complete",
    "onError": "http://your-server.com/hooks/error"
  }
}
```

### 方式 2: 全局回调 URL

通过 `callbackUrl` 配置统一的回调端点：

```json
{
  "taskId": "task-123",
  "callbackUrl": "http://your-server.com/api/callbacks"
}
```

## Hook 数据格式

### onStart

任务开始时发送：

```json
{
  "taskId": "task-123",
  "nodeId": "node-001",
  "startedAt": "2026-03-25T10:00:00.000Z"
}
```

### onOutput

有输出时发送：

```json
{
  "taskId": "task-123",
  "output": "处理中...\n步骤 1 完成\n"
}
```

### onComplete

任务完成时发送：

```json
{
  "taskId": "task-123",
  "status": "SUCCESS",
  "output": "最终执行结果",
  "exitCode": 0,
  "completedAt": "2026-03-25T10:05:00.000Z"
}
```

### onError

任务失败时发送：

```json
{
  "taskId": "task-123",
  "error": "执行超时：超过 300 秒"
}
```

## 使用示例

### 示例 1: 接收任务完成通知

```bash
# 启动你的回调服务器
node your-callback-server.js

# 发送任务时配置 Hook
curl -X POST http://openclaw-server/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "完成代码审查",
    "hooks": {
      "onComplete": "http://localhost:3001/notify"
    }
  }'
```

### 示例 2: 实时接收输出

```javascript
// 回调服务器
const express = require('express')
const app = express()

app.use(express.json())

app.post('/hooks/output', (req, res) => {
  console.log('收到输出:', req.body.output)
  // 可以将输出转发到 WebSocket 等
  res.json({ received: true })
})

app.listen(3001, () => {
  console.log('回调服务器运行在 3001 端口')
})
```

### 示例 3: 错误告警

```javascript
app.post('/hooks/error', (req, res) => {
  const { taskId, error } = req.body

  // 发送告警通知
  sendAlert({
    title: '任务执行失败',
    message: `任务 ${taskId}: ${error}`,
    level: 'error'
  })

  res.json({ received: true })
})
```

## 与 Callback 的区别

ClawNode 有**两种**通知机制：

### Callback（回调）
- **目标**: OpenClaw 服务器
- **用途**: 任务状态回传
- **事件**: start, output, complete, error
- **配置**: 由 `OPENCLAW_URL` 自动确定

### Hook（钩子）
- **目标**: 任意指定的 URL
- **用途**: 第三方集成/自定义通知
- **事件**: onStart, onOutput, onComplete, onError
- **配置**: 在任务中通过 `hooks` 字段指定

## 完整流程图

```
┌─────────────┐
│ OpenClaw    │ 发送任务
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  ClawNode   │ 接收任务
└──────┬──────┘
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│  Callback   │   │    Hook     │
│  (OpenClaw) │   │ (第三方 URL)│
└─────────────┘   └─────────────┘
```

## 最佳实践

1. **只配置需要的 Hook** - 不必配置所有 4 个事件
2. **确保 Hook 服务器可靠** - Hook 失败不会影响任务执行
3. **快速响应** - Hook 应该快速返回，耗时操作异步处理
4. **幂等处理** - 同一个事件可能多次发送

## 故障排除

### Hook 没有收到？

1. 检查 URL 是否正确
2. 确认网络可达
3. 查看 ClawNode 日志是否有错误
4. 验证 Hook 服务器是否正常响应

### Hook 失败会影响任务吗？

不会。Hook 失败不会影响任务执行，只会在日志中记录错误。

## 相关文件

- `src/types.ts` - Hook 类型定义
- `src/modules/hook-receiver.ts` - Hook 接收器实现
- `src/modules/callback-client.ts` - 回调客户端实现
- `test/CALLBACK_TESTING.md` - 回调测试文档
