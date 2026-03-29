# ClawNode CLI 使用指南

## 安装和构建

```bash
# 1. 安装依赖
npm install

# 2. 构建项目
npm run build

# 3. 全局安装（可选）
npm link
```

## 命令列表

```bash
# 查看所有命令
clawnode --help

# 查看特定命令帮助
clawnode <command> --help
```

| 命令 | 说明 |
|------|------|
| `start` | 启动节点服务（推送/轮询模式） |
| `exec` | 直接执行 Claude Code 命令 |
| `run` | 执行并发送通知（exec --notify 的快捷方式） |
| `status` | 显示节点状态 |
| `config` | 显示当前配置 |

---

## exec 命令

执行 Claude Code 命令，但不发送通知到渠道。

### 基本用法

```bash
clawnode exec "创建一个 Express Hello World 项目"
```

### 选项

| 选项 | 简写 | 说明 |
|------|------|------|
| `--session <id>` | `-s` | 使用指定的 Session ID |
| `--workdir <dir>` | `-w` | 指定工作目录 |
| `--notify` | `-n` | 执行完成后发送通知 |

### 示例

```bash
# 创建新项目
clawnode exec "创建一个新的 Node.js 项目"

# 在指定目录执行
clawnode exec -w /path/to/project "添加新的 API 端点"

# 继续之前的会话
clawnode exec -s session-123 "添加用户认证功能"

# 执行并发送通知
clawnode exec --notify "修复登录页面的 bug"

# 组合使用
clawnode exec -s session-abc -w /tmp/my-app "添加数据库连接"
```

---

## run 命令

执行 Claude Code 命令并发送通知到渠道（相当于 `exec --notify`）。

### 基本用法

```bash
clawnode run "创建一个 Express Hello World 项目"
```

### 选项

| 选项 | 简写 | 说明 |
|------|------|------|
| `--session <id>` | `-s` | 使用指定的 Session ID |
| `--workdir <dir>` | `-w` | 指定工作目录 |

### 示例

```bash
# 创建项目并发送通知
clawnode run "创建一个新的 React 项目"

# 在现有项目中开发并发送通知
clawnode run -w /path/to/existing-project "添加新的功能模块"

# 继续会话并发送通知
clawnode run -s session-xyz "继续开发用户管理功能"
```

---

## start 命令

启动 ClawNode 节点服务，支持推送模式和轮询模式。

### 选项

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--port <number>` | `-p` | Hook 服务端口 | 3001 |
| `--interval <number>` | `-i` | 轮询间隔 (ms) | 5000 |
| `--mode <mode>` | `-m` | 运行模式 (push/poll/hybrid) | hybrid |

### 示例

```bash
# 默认启动（混合模式）
clawnode start

# 纯推送模式
clawnode start --mode push

# 纯轮询模式，10 秒间隔
clawnode start --mode poll --interval 10000

# 自定义端口
clawnode start --port 4000
```

### 环境变量

启动前建议在 `.env` 中配置：

```bash
# OpenClaw 服务器地址
OPENCLAW_URL=http://localhost:3000

# 节点标识
NODE_ID=node-001

# 节点密钥
NODE_SECRET=your-secret-key

# 运行模式
RUN_MODE=hybrid

# 端口配置
RECEIVER_PORT=3000
HOOK_PORT=3001

# 通知配置
OPENCLAW_BIN=/path/to/openclaw
NOTIFY_CHANNEL=telegram
NOTIFY_TARGET=@your-group
```

---

## status 命令

显示当前节点配置状态。

```bash
clawnode status

# 输出示例：
ClawNode Status:
  Node ID: node-001
  OpenClaw URL: http://localhost:3000
  Hook Port: 3001
  Poll Interval: 5000ms
  Exec Timeout: 300000ms
  Run Mode: hybrid
  Receiver Port: 3000
```

---

## config 命令

显示完整的配置信息（JSON 格式）。

```bash
clawnode config

# 输出示例：
{
  "openClawUrl": "http://localhost:3000",
  "nodeId": "node-001",
  "nodeSecret": "***",
  "pollInterval": 5000,
  "hookPort": 3001,
  "execTimeout": 300000,
  "receiverPort": 3000,
  "mode": "hybrid"
}
```

---

## 使用场景

### 场景 1：单机开发（推荐 CLI）

```bash
# 1. 创建新项目
clawnode run "创建一个新的 Express 项目，包含基本的 CRUD 路由"

# 2. 继续开发
clawnode run -s <session-id> "添加用户认证中间件"

# 3. 再次继续
clawnode run -s <session-id> "添加数据库模型"
```

### 场景 2：现有项目开发

```bash
# 在现有项目中添加功能
clawnode run -w /path/to/project "添加新的 API 端点 /api/users"
```

### 场景 3：多项目并行开发

```bash
# 项目 A - 创建会话
clawnode exec -w /tmp/project-a "初始化项目"
# → 返回 session-a-123

# 项目 B - 创建会话
clawnode exec -w /tmp/project-b "初始化项目"
# → 返回 session-b-456

# 继续项目 A
clawnode exec -s session-a-123 "添加路由"

# 继续项目 B
clawnode exec -s session-b-456 "添加模型"
```

### 场景 4：会话锁定保护

```bash
# 1. 创建项目
clawnode run "创建项目"
# → session-123

# 2. 通过 OpenClaw 发送锁定指令
{ type: "SESSION_LOCK", sessionId: "session-123" }

# 3. 会话现在被锁定，不会被误删

# 4. 需要解锁才能继续
{ type: "SESSION_UNLOCK", sessionId: "session-123" }
```

---

## 通知配置

### 配置通知渠道

在 `.env` 中配置：

```bash
# openclaw CLI 路径
OPENCLAW_BIN=/home/ubuntu/.npm-global/bin/openclaw

# 通知渠道：telegram, dingtalk, wechat, feishu
NOTIFY_CHANNEL=telegram

# 通知目标群组
NOTIFY_TARGET=@my-group
```

### 通知示例

**任务开始**：
```
🚀 ClawNode 任务开始执行
📋 任务 ID: `cli-1711439400000`
🖥️ 节点：`node-001`
📊 状态：`RUNNING`
📝 提示：创建一个 Express 项目
```

**任务完成**：
```
✅ ClawNode 任务完成
📋 任务 ID: `cli-1711439400000`
🖥️ 节点：`node-001`
📊 状态：`SUCCESS`
📝 执行摘要：
Express 项目创建完成
- package.json 已生成
- src/index.js 已创建
- 依赖已安装
```

**任务失败**：
```
❌ ClawNode 任务失败
📋 任务 ID: `cli-1711439400000`
🖥️ 节点：`node-001`
📊 状态：`FAILED`
⚠️ 错误信息：
Permission denied: cannot write to /root
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

### 通过 OpenClaw 控制 Session

```javascript
// 继续会话
{ type: "SESSION_CONTINUE", sessionId: "session-123", prompt: "添加新功能" }

// 暂停会话
{ type: "SESSION_PAUSE", sessionId: "session-123" }

// 恢复会话
{ type: "SESSION_RESUME", sessionId: "session-123", prompt: "继续" }

// 锁定会话（防止误删）
{ type: "SESSION_LOCK", sessionId: "session-123" }

// 解锁会话
{ type: "SESSION_UNLOCK", sessionId: "session-123" }

// 删除会话
{ type: "SESSION_DELETE", sessionId: "session-123" }

// 列出所有会话
{ type: "SESSION_LIST" }
```

---

## 故障排除

### 问题：命令执行失败

```bash
# 查看详细日志
npm run dev

# 检查 claude 命令是否可用
which claude
```

### 问题：通知没有发送

```bash
# 检查 openclaw CLI 路径
which openclaw

# 测试发送消息
openclaw message send --channel telegram --target @test --message "测试"
```

### 问题：端口被占用

```bash
# 查看端口占用
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# 使用其他端口
clawnode start --port 4000
```

---

## 相关文档

- `QUICKSTART.md` - 快速启动指南
- `SESSION_MANAGEMENT.md` - Session 管理详细文档
- `PUSH_MODE_DEPLOYMENT.md` - 推送模式部署指南
- `ARCHITECTURE.md` - 架构说明
