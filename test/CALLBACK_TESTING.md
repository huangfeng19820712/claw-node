# ClawNode 回调测试指南

## 概述

ClawNode 在执行任务过程中会发送以下回调：

| 事件 | 触发时机 | 数据内容 |
|------|----------|----------|
| `start` | 任务开始时 | nodeId, startedAt |
| `output` | 有输出时 | output (字符串) |
| `complete` | 任务完成时 | status, output, exitCode, completedAt |
| `error` | 任务失败时 | error (错误信息) |

## 测试架构

```
┌─────────────┐     HTTP POST      ┌──────────────────┐
│   ClawNode  │ ──────────────────>│  Callback Server │
│             │   /api/callbacks   │  (Mock/Real)     │
└─────────────┘                    └──────────────────┘
     │
     │ 回调事件:
     ├─ start    - 任务开始
     ├─ output   - 实时输出
     ├─ complete - 任务完成
     └─ error    - 任务失败
```

## 测试方法

### 方法 1: 单元测试 (推荐首选)

```bash
npm test -- callback.test.ts
```

**优点：**
- 不需要启动外部服务
- 快速执行
- 100% 隔离

**测试内容：**
- 回调流程（成功/失败）
- 数据结构验证
- 错误处理
- 并发回调

### 方法 2: E2E 测试（完整流程）

需要启动 Mock 回调服务器：

```bash
# 终端 1: 启动回调服务器
node test/mocks/callback-server.js

# 终端 2: 运行 E2E 测试
node test/test-callback-e2e.js
```

**优点：**
- 真实 HTTP 请求
- 验证完整流程
- 可以看到实际回调数据

### 方法 3: 手动发送测试回调

```bash
# 启动回调服务器
node test/mocks/callback-server.js

# 发送测试回调
curl -X POST http://localhost:9998/api/callbacks \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "manual-test-123",
    "event": "start",
    "data": {"nodeId": "test-node"},
    "nodeId": "test-node"
  }'

# 查看收到的回调
curl http://localhost:9998/api/callbacks
```

## 测试用例

### 1. 成功任务回调流程

```
start → output → output → output → complete
```

**验证点：**
- 回调顺序正确
- 数据完整
- taskId 一致

### 2. 失败任务回调流程

```
start → output → error
```

**验证点：**
- 错误信息正确传递
- 没有 complete 回调

### 3. 并发任务回调

```
task-1: start → output → complete
task-2: start → output → complete
task-3: start → output → complete
```

**验证点：**
- 任务数据隔离
- 回调不混淆

### 4. 大量输出回调

```
start → output(×10) → complete
```

**验证点：**
- 所有输出都收到
- 顺序正确

## 运行测试

### 快速测试（单元测试）

```bash
# 运行回调相关测试
npm test -- callback.test.ts

# 查看所有测试
npm test
```

### 完整测试（E2E）

```bash
# 1. 启动回调服务器
node test/mocks/callback-server.js

# 2. 等待服务器启动后，运行 E2E 测试
# （新终端）
node test/test-callback-e2e.js

# 3. 或者运行简单测试脚本
node test/test-callback.js
```

### 查看回调服务器状态

```bash
# 健康检查
curl http://localhost:9998/health

# 查看所有回调
curl http://localhost:9998/api/callbacks

# 查看统计信息
curl http://localhost:9998/api/stats

# 查看特定任务的回调
curl http://localhost:9998/api/callbacks/task-123

# 重置数据
curl -X POST http://localhost:9998/api/reset
```

## 测试结果示例

### 单元测试输出

```
PASS src/__tests__/integration/callback.test.ts
  CallbackClient 集成测试
    回调流程测试
      √ 应该完成完整的成功任务回调流程
      √ 应该完成失败任务的回调流程
      √ 应该支持多次输出回调
    回调数据结构测试
      √ 开始回调应包含节点信息
      √ 完成回调应包含执行结果
      √ 错误回调应包含错误信息
    错误处理测试
      √ 回调失败时不应抛出异常
      √ 回调失败时应记录日志
    并发回调测试
      √ 应该能处理并发回调
      √ 并发回调应该保持数据独立

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

### E2E 测试输出

```
╔════════════════════════════════════════════════╗
║   ClawNode 回调 E2E 测试                        ║
╚════════════════════════════════════════════════╝

回调服务器：http://localhost:9998

[回调服务器启动消息]

==================================================
测试 1: 成功任务回调
==================================================
任务 ID: e2e-success-1234567890
发送开始回调...
发送输出回调 (1)...
发送输出回调 (2)...
发送输出回调 (3)...
发送完成回调...
✓ 回调序列正确：start -> output -> output -> output -> complete
✓ 成功任务测试通过，共 5 个回调

==================================================
测试 2: 失败任务回调
==================================================
...
✓ 失败任务测试通过，共 3 个回调

==================================================
测试结果汇总
==================================================
✓ 成功任务：通过
✓ 失败任务：通过
✓ 并发任务：通过
✓ 大量输出：通过

总计：4/4 通过
✓ 所有测试通过!
```

## 回调数据格式

### 开始回调 (start)

```json
{
  "taskId": "task-123",
  "event": "start",
  "data": {
    "nodeId": "node-001",
    "startedAt": "2026-03-25T10:00:00.000Z"
  },
  "nodeId": "node-001"
}
```

### 输出回调 (output)

```json
{
  "taskId": "task-123",
  "event": "output",
  "data": {
    "output": "处理中...\n步骤 1 完成\n"
  },
  "nodeId": "node-001"
}
```

### 完成回调 (complete)

```json
{
  "taskId": "task-123",
  "event": "complete",
  "data": {
    "status": "SUCCESS",
    "output": "最终执行结果",
    "error": undefined,
    "exitCode": 0,
    "completedAt": "2026-03-25T10:05:00.000Z"
  },
  "nodeId": "node-001"
}
```

### 错误回调 (error)

```json
{
  "taskId": "task-123",
  "event": "error",
  "data": {
    "error": "执行超时：超过 300 秒"
  },
  "nodeId": "node-001"
}
```

## 常见问题

### Q: 回调没有收到？

**排查步骤：**
1. 检查回调服务器是否运行：`curl http://localhost:9998/health`
2. 检查网络是否通畅
3. 查看 ClawNode 日志是否有错误
4. 确认 OPENCLAW_URL 配置正确

### Q: 回调数据不完整？

**排查步骤：**
1. 查看回调服务器的原始数据
2. 检查 CallbackClient 的 sendCallback 方法
3. 确认 data 参数正确传递

### Q: 如何调试回调？

**方法：**
1. 在回调服务器添加日志
2. 使用 curl 手动发送测试数据
3. 查看 CallbackClient 的 axios 请求日志

### Q: 并发回调会丢失吗？

不会。每个回调都是独立的 HTTP POST 请求，axios 会按序处理。

## 测试检查清单

在部署前确认：

- [ ] 单元测试全部通过
- [ ] E2E 测试全部通过
- [ ] 回调序列正确
- [ ] 数据格式符合预期
- [ ] 错误处理正常
- [ ] 并发回调正常
- [ ] Mock 服务器和真实服务器行为一致

## 相关文件

| 文件 | 用途 |
|------|------|
| `src/modules/callback-client.ts` | 回调客户端实现 |
| `src/__tests__/integration/callback.test.ts` | 单元测试 |
| `test/mocks/callback-server.js` | Mock 回调服务器 |
| `test/test-callback-e2e.js` | E2E 测试脚本 |
| `test/test-callback.js` | 简单测试脚本 |
