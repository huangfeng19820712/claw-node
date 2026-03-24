# ClawNode

OpenClaw 执行节点代理，负责接收任务、调用 Claude Code 执行，并将结果回传。

## 安装

```bash
npm install
```

## 配置

复制 `.env.example` 为 `.env` 并配置：

```bash
# OpenClaw 服务器地址
OPENCLAW_URL=http://localhost:3000

# 节点标识
NODE_ID=node-001

# 节点密钥（用于身份验证）
NODE_SECRET=your-secret-key

# 任务轮询间隔（毫秒）
POLL_INTERVAL=5000

# Hook 回调服务端口
HOOK_PORT=3001

# 执行超时时间（毫秒）
EXEC_TIMEOUT=300000

# Claude Code 配置
CLAUDE_API_KEY=your-claude-api-key

# 日志级别
LOG_LEVEL=info
```

## 使用

### 启动节点服务

```bash
npm start
# 或
npx clawnode start
```

### 命令行选项

```bash
# 查看状态
npx clawnode status

# 查看配置
npx clawnode config

# 直接执行命令
npx clawnode exec "写一个 hello world 函数"

# 启动服务（自定义端口和轮询间隔）
npx clawnode start -p 3001 -i 5000
```

## 项目结构

```
src/
├── index.ts           # 主入口，ClawNode 类
├── config.ts          # 配置管理
├── types.ts           # 类型定义
├── bin/
│   └── clawnode.ts    # CLI 入口
├── modules/
│   ├── task-poller.ts     # 任务轮询器
│   ├── executor.ts        # 任务执行器
│   ├── session-manager.ts # Session 管理器
│   ├── hook-receiver.ts   # Hook 回调接收器
│   ├── callback-client.ts # 回调客户端
│   └── log-streamer.ts    # 日志流式输出
└── utils/
    └── logger.ts      # 日志工具
```

## 核心功能

- **Task Poller**: 从 OpenClaw 服务器轮询任务（Pull 模式）
- **Executor**: 调用 Claude Code 执行任务
- **Session Manager**: 管理 Session 持续交互
- **Hook Receiver**: 接收和处理 Hook 回调
- **Callback Client**: 将执行结果回传到 OpenClaw
- **Log Streamer**: 日志流式输出

## 任务状态机

```
PENDING → RUNNING → FAILED → RETRY → SUCCESS
```

## 开发

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 测试
npm test
```

## License

MIT
