# ClawNode 测试方案

## 一、测试环境要求

### 1. 基础环境

| 依赖项 | 版本要求 | 检查命令 |
|--------|----------|----------|
| Node.js | >= 18.0.0 | `node --version` |
| npm | >= 9.0.0 | `npm --version` |

### 2. 环境验证（推荐）

在运行测试前，建议先运行环境验证脚本：

```bash
node test/verify-env.js
```

这将检查：
- Node.js 和 npm 版本
- 依赖是否安装
- 配置文件是否存在
- 端口是否可用

### 3. 依赖安装

```bash
npm install
```

测试相关依赖已包含在 `package.json` 中：
- `jest` - 测试框架
- `ts-jest` - TypeScript 支持
- `@types/jest` - Jest 类型定义
- `supertest` - HTTP 测试工具

### 3. 测试环境配置

`.env.test` 文件已创建，包含测试环境配置：

```bash
NODE_ENV=test
LOG_LEVEL=error
OPENCLAW_URL=http://localhost:9999
NODE_ID=test-node
NODE_SECRET=test-secret
HOOK_PORT=9998
EXEC_TIMEOUT=5000
```

## 二、测试结构

```
src/__tests__/
├── setup.ts                    # 测试环境配置
├── modules/
│   ├── logger.test.ts          # Logger 单元测试
│   ├── session-manager.test.ts # SessionManager 单元测试
│   ├── task-poller.test.ts     # TaskPoller 单元测试
│   ├── callback-client.test.ts # CallbackClient 单元测试
│   ├── hook-receiver.test.ts   # HookReceiver 单元测试
│   └── log-streamer.test.ts    # LogStreamer 单元测试
├── integration/
│   └── flow.test.ts            # 集成测试
└── e2e/
    └── clawnode.test.ts        # E2E 测试

test/
├── mocks/
│   └── openclaw-server.js      # Mock OpenClaw 服务器
└── manual-test.js              # 手动测试工具
```

## 三、运行测试

### 1. 运行所有测试

```bash
npm test
```

### 2. 运行并生成覆盖率报告

```bash
npm run test:coverage
```

### 3. 监听模式（开发时使用）

```bash
npm run test:watch
```

### 4. 运行特定测试文件

```bash
npm test -- session-manager.test.ts
```

### 5. 运行匹配的测试

```bash
npm test -- -t "SessionManager"
```

### 6. 详细输出

```bash
npm run test:verbose
```

## 四、测试类型

### 1. 单元测试 (Unit Tests)

测试单个模块/函数的功能，使用 mock 隔离外部依赖。

**覆盖的模块：**
- `Logger` - 日志工具
- `SessionManager` - Session 管理器
- `TaskPoller` - 任务轮询器
- `CallbackClient` - 回调客户端
- `HookReceiver` - Hook 回调接收器
- `LogStreamer` - 日志流式输出

**运行单元测试：**
```bash
npm test -- src/__tests__/modules/
```

### 2. 集成测试 (Integration Tests)

测试多个模块之间的协作。

**运行集成测试：**
```bash
npm test -- flow.test.ts
```

### 3. E2E 测试 (End-to-End Tests)

完整流程测试，需要 Mock 外部服务。

## 五、手动测试方案

### 1. 使用手动测试工具

```bash
node test/manual-test.js
```

这将启动一个交互式菜单，可以选择各种测试选项。

### 2. CLI 命令测试

```bash
# 查看帮助
npx clawnode --help

# 查看状态
npx clawnode status

# 查看配置
npx clawnode config

# 执行命令（需要配置 CLAUDE_API_KEY）
npx clawnode exec "hello"
```

### 3. 启动服务测试

```bash
# 启动服务
npm start

# 健康检查
curl http://localhost:3001/health
```

### 4. Hook 回调测试

```bash
# 发送测试 hook
curl -X POST http://localhost:3001/hooks/task-123/start \
  -H "Content-Type: application/json" \
  -d '{"data": "test"}'
```

## 六、Mock 服务

### 启动 Mock OpenClaw 服务器

```bash
# 方法 1: 使用手动测试工具
node test/manual-test.js
# 选择 3

# 方法 2: 直接启动
node test/mocks/openclaw-server.js

# 方法 3: 指定端口
PORT=8888 node test/mocks/openclaw-server.js
```

### Mock 服务器 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/tasks/poll` | GET | 轮询任务 |
| `/api/tasks/:id/status` | POST | 更新任务状态 |
| `/api/callbacks` | POST | 接收回调 |
| `/api/callbacks` | GET | 查看回调历史 |
| `/api/tasks/:id` | GET | 查看任务状态 |
| `/health` | GET | 健康检查 |
| `/api/reset` | POST | 重置数据 |

### 使用示例

```bash
# 查看回调历史
curl http://localhost:9999/api/callbacks

# 查看任务状态
curl http://localhost:9999/api/tasks/task-123

# 重置数据
curl -X POST http://localhost:9999/api/reset

# 健康检查
curl http://localhost:9999/health
```

## 七、测试检查清单

### 功能测试
- [ ] TaskPoller 能够正确轮询任务
- [ ] Executor 能够执行 Claude Code 命令
- [ ] SessionManager 能够管理 session 生命周期
- [ ] HookReceiver 能够接收 hook 回调
- [ ] CallbackClient 能够发送回调
- [ ] LogStreamer 能够流式输出日志

### 集成测试
- [ ] 任务从拉取到执行完成流程正确
- [ ] 状态流转正确（PENDING → RUNNING → SUCCESS/FAILED）
- [ ] 回调能够正确发送到 OpenClaw
- [ ] 错误能够正确处理和报告

### 边界测试
- [ ] 网络错误处理
- [ ] 超时处理
- [ ] 空数据处理
- [ ] 并发处理

## 八、持续集成

### GitHub Actions 示例

创建 `.github/workflows/test.yml`：

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]

    steps:
    - uses: actions/checkout@v4

    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      run: npm test

    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/lcov.info
```

## 九、常见问题

### Q: 测试超时怎么办？
A: 增加超时时间：`npm test -- --testTimeout=60000`

### Q: 如何调试测试？
A: 使用 `console.log` 或添加 `debugger` 语句，然后运行：
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Q: 如何测试需要 API Key 的功能？
A: 在测试中使用 mock，或在 `.env.test` 中配置测试用的 API Key

### Q: 覆盖率报告在哪里？
A: 运行 `npm run test:coverage` 后，报告在 `coverage/` 目录下
打开 `coverage/index.html` 查看 HTML 报告

### Q: 如何只运行失败的测试？
A: 使用 `npm test -- --bail` 或 `npm test -- --failed`

## 十、当前测试覆盖情况

运行 `npm test` 后的测试结果：

```
Test Suites: 8 passed, 8 total
Tests:       1 skipped, 54 passed, 55 total

File                 | Coverage
---------------------|---------
src/                 | 50.58%
src/modules/         | 60.86%
src/utils/           | 68.57%
```

主要覆盖的模块：
- `SessionManager`: 97.72%
- `TaskPoller`: 80%
- `CallbackClient`: 91.3%
- `LogStreamer`: 71.42%
- `Logger`: 68.57%
