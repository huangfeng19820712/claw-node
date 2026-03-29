# ClawNode 与 OpenClaw 渠道集成指南

## 概述

通过 Claude Code Hooks + openclaw CLI 命令，实现 ClawNode 任务状态推送到 OpenClaw 的消息渠道（钉钉、企业微信、飞书、Telegram 等）。

**核心思路**：
1. 在 ClawNode 中配置 Hook 脚本
2. 任务状态变化时触发 Hook
3. Hook 脚本调用 `openclaw message send` 发送通知

---

## 架构设计

```
┌───────────────────────────────────────────────────────────────────┐
│                          用户操作                                  │
│     在渠道中发送消息 → OpenClaw 接收并创建任务                      │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   OpenClaw DB   │
                    │   (任务队列)     │
                    └────────┬────────┘
                             │ 轮询
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│                         ClawNode                                  │
│                                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │
│  │ TaskPoller  │───>│  Executor   │───>│ Claude Code │           │
│  └─────────────┘    └─────────────┘    └──────┬──────┘           │
│                                               │                   │
│  ┌─────────────┐    ┌─────────────┐          │                   │
│  │ Hook 脚本    │<───│ HookReceiver │<────────┘                   │
│  │ notify.sh   │    └─────────────┘                              │
│  └──────┬──────┘                                                  │
│         │                                                         │
│         │ openclaw message send                                   │
│         ▼                                                         │
│  ┌─────────────────┐                                              │
│  │  OpenClaw CLI   │                                              │
│  └────────┬────────┘                                              │
└───────────┼───────────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐
    │ 消息渠道       │
    │ - 钉钉         │
    │ - 企业微信     │
    │ - 飞书         │
    │ - Telegram    │
    └───────────────┘
```

---

## 配置步骤

### 步骤 1：创建通知 Hook 脚本

创建 `.claude/hooks/notify-openclaw.sh`：

```bash
#!/bin/bash
# ClawNode Hook: 任务状态通知 OpenClaw 渠道
# 触发时机：TaskStart, TaskOutput, TaskComplete, TaskError

set -uo pipefail

# 配置
OPENCLAW_BIN="${OPENCLAW_BIN:-openclaw}"  # openclaw CLI 路径
CHANNEL="${NOTIFY_CHANNEL:-telegram}"      # 默认 Telegram
TARGET="${NOTIFY_TARGET:-}"                # 目标群组/用户
LOG="${LOG_FILE:-/var/log/clawnode/hook.log}"

# 确保日志目录存在
mkdir -p "$(dirname "$LOG")"

log() {
    echo "[$(date -Iseconds)] $*" >> "$LOG"
}

log "=== ClawNode Notify Hook ==="

# 读取 stdin (ClawNode 传递的任务数据)
INPUT=""
if [ -t 0 ]; then
    log "stdin is tty, skipping"
    exit 0
fi

INPUT=$(timeout 2 cat /dev/stdin 2>/dev/null || true)

# 解析输入数据
TASK_ID=$(echo "$INPUT" | jq -r '.taskId // "unknown"' 2>/dev/null || echo "unknown")
EVENT=$(echo "$INPUT" | jq -r '.event // "unknown"' 2>/dev/null || echo "unknown")
STATUS=$(echo "$INPUT" | jq -r '.data.status // "unknown"' 2>/dev/null || echo "unknown")
OUTPUT=$(echo "$INPUT" | jq -r '.data.output // ""' 2>/dev/null || echo "")
ERROR=$(echo "$INPUT" | jq -r '.data.error // ""' 2>/dev/null || echo "")
NODE_ID=$(echo "$INPUT" | jq -r '.data.nodeId // "unknown"' 2>/dev/null || echo "unknown")

log "task=$TASK_ID event=$EVENT status=$STATUS"

# 构建消息内容
build_message() {
    local emoji=""
    local title=""

    case "$EVENT" in
        start)
            emoji="🚀"
            title="任务开始执行"
            ;;
        output)
            emoji="📝"
            title="任务执行中"
            ;;
        complete)
            emoji="✅"
            title="任务完成"
            ;;
        error)
            emoji="❌"
            title="任务失败"
            ;;
        *)
            emoji="📢"
            title="任务状态更新"
            ;;
    esac

    # 构建消息体
    local msg="${emoji} *ClawNode ${title}*

📋 **任务 ID**: \`${TASK_ID}\`
🖥️ **节点**: \`${NODE_ID}\`
📊 **状态**: \`${STATUS}\`"

    # 添加输出摘要（如果有）
    if [ -n "$OUTPUT" ]; then
        local summary=$(echo "$OUTPUT" | tail -c 500 | tr '\n' ' ')
        msg="${msg}

📝 **执行摘要**:
\`\`\`
${summary:0:400}
\`\`\`"
    fi

    # 添加错误信息（如果有）
    if [ "$EVENT" = "error" ] && [ -n "$ERROR" ]; then
        msg="${msg}

⚠️ **错误信息**:
\`\`\`
${ERROR:0:200}
\`\`\`"
    fi

    echo "$msg"
}

# 发送消息
send_notification() {
    local message="$1"

    if [ -z "$TARGET" ]; then
        log "No target configured, writing to result file only"
        # 写入结果文件供后续处理
        echo "$INPUT" | jq --arg msg "$message" '.message = $msg' > /tmp/clawnode-notify.json
        return 0
    fi

    # 调用 openclaw CLI 发送消息
    $OPENCLAW_BIN message send \
        --channel "$CHANNEL" \
        --target "$TARGET" \
        --message "$message" 2>&1

    if [ $? -eq 0 ]; then
        log "Notification sent successfully"
    else
        log "Failed to send notification"
    fi
}

# 主流程
MESSAGE=$(build_message)
log "Message built (${#MESSAGE} chars)"

# 发送通知
send_notification "$MESSAGE"

log "=== Hook completed ==="
exit 0
```

### 步骤 2：创建 ClawNode 专用 Hook 脚本

创建 `.claude/hooks/clawnode-task-hook.sh`：

```bash
#!/bin/bash
# ClawNode 任务 Hook - 在任务执行的关键节点触发

set -uo pipefail

LOG_FILE="/var/log/clawnode/task-hook.log"
CALLBACK_URL="${CLAWNODE_CALLBACK_URL:-}"
NOTIFY_SCRIPT="${CLAWNODE_NOTIFY_SCRIPT:-/path/to/notify-openclaw.sh}"

log() {
    echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

log "=== ClawNode Task Hook ==="

# 读取输入
INPUT=$(cat)
log "Input: $INPUT"

# 解析数据
TASK_ID=$(echo "$INPUT" | jq -r '.taskId // empty')
EVENT=$(echo "$INPUT" | jq -r '.event // empty')

if [ -z "$TASK_ID" ] || [ -z "$EVENT" ]; then
    log "Missing taskId or event, skipping"
    exit 0
fi

# 1. 写入本地日志
echo "$INPUT" | jq --arg ts "$(date -Iseconds)" '. + {logged_at: $ts}' >> /var/log/clawnode/task-events.jsonl

# 2. 调用通知脚本（如果配置了）
if [ -n "$NOTIFY_SCRIPT" ] && [ -x "$NOTIFY_SCRIPT" ]; then
    log "Calling notify script: $NOTIFY_SCRIPT"
    echo "$INPUT" | bash "$NOTIFY_SCRIPT" &
fi

# 3. HTTP 回调（如果配置了）
if [ -n "$CALLBACK_URL" ]; then
    log "Sending HTTP callback to: $CALLBACK_URL"
    curl -s -X POST "$CALLBACK_URL" \
        -H "Content-Type: application/json" \
        -d "$INPUT" > /dev/null &
fi

log "=== Hook completed ==="
exit 0
```

### 步骤 3：配置 ClawNode Hooks

在 `.claude/settings.json` 中配置：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/clawnode-task-hook.sh",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/notify-openclaw.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/notify-openclaw.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### 步骤 4：配置环境变量

在 `.env` 文件中添加：

```bash
# OpenClaw 通知配置
OPENCLAW_BIN=/home/ubuntu/.npm-global/bin/openclaw
NOTIFY_CHANNEL=telegram
NOTIFY_TARGET=@your-group
LOG_FILE=/var/log/clawnode/hook.log
CLAWNODE_CALLBACK_URL=http://your-openclaw-server/api/callbacks
CLAWNODE_NOTIFY_SCRIPT=/path/to/notify-openclaw.sh
```

---

## 消息格式示例

### 任务开始

```
🚀 *ClawNode 任务开始执行*

📋 **任务 ID**: `task-20260326-001`
🖥️ **节点**: `node-001`
📊 **状态**: `RUNNING`
```

### 任务完成

```
✅ *ClawNode 任务完成*

📋 **任务 ID**: `task-20260326-001`
🖥️ **节点**: `node-001`
📊 **状态**: `SUCCESS`

📝 **执行摘要**:
```
项目创建完成！已生成以下文件：
- package.json
- src/index.js
- src/routes/api.js
...
```
```

### 任务失败

```
❌ *ClawNode 任务失败*

📋 **任务 ID**: `task-20260326-001`
🖥️ **节点**: `node-001`
📊 **状态**: `FAILED`

⚠️ **错误信息**:
```
npm install failed: ENOSPC No space left on device
```
```

---

## 完整使用流程

### 1. 用户在渠道中下发任务

```
用户在 Telegram 群聊中发送：
/clawnode 创建新的 Node.js 项目，使用 Express 框架
```

### 2. OpenClaw 接收并创建任务

```
OpenClaw 机器人接收消息 → 创建任务到数据库
{
  "id": "task-001",
  "nodeId": "node-001",
  "type": "EXECUTE",
  "prompt": "创建新的 Node.js 项目，使用 Express 框架",
  "status": "PENDING"
}
```

### 3. ClawNode 轮询并执行

```
ClawNode 轮询获取任务 → 执行 Claude Code → 触发 Hooks
```

### 4. Hook 发送通知

```
Hook 脚本执行 → 调用 openclaw message send → 发送消息到渠道
```

### 5. 用户在渠道中查看结果

```
渠道收到通知：
✅ ClawNode 任务完成
📋 任务 ID: task-001
📝 执行摘要：项目创建完成...
```

---

## 高级用法

### 多渠道路由

```bash
#!/bin/bash
# 根据任务类型发送到不同渠道

TASK_TYPE=$(echo "$INPUT" | jq -r '.taskType // "default"')

case "$TASK_TYPE" in
    critical)
        CHANNEL=dingtalk
        TARGET=@admin-group
        ;;
    normal)
        CHANNEL=telegram
        TARGET=@dev-group
        ;;
    *)
        CHANNEL=wechat
        TARGET=@all-group
        ;;
esac
```

### 带交互的通知

```bash
#!/bin/bash
# 发送带按钮的消息（如果渠道支持）

MESSAGE="{
  \"text\": \"任务完成，是否需要继续？\",
  \"buttons\": [
    {\"text\": \"继续开发\", \"callback\": \"continue:${TASK_ID}\"},
    {\"text\": \"查看结果\", \"callback\": \"view:${TASK_ID}\"},
    {\"text\": \"取消\", \"callback\": \"cancel:${TASK_ID}\"}
  ]
}"

openclaw message send \
    --channel "$CHANNEL" \
    --target "$TARGET" \
    --message "$MESSAGE" \
    --type interactive
```

---

## 故障排除

### 问题：openclaw 命令找不到

```bash
# 检查 openclaw 是否安装
which openclaw

# 如果找不到，找到实际路径
find /home -name "openclaw" 2>/dev/null

# 更新 OPENCLAW_BIN 配置
export OPENCLAW_BIN=/path/to/openclaw
```

### 问题：消息发送失败

```bash
# 检查渠道配置
openclaw channels list

# 测试发送
openclaw message send --channel telegram --target @test --message "测试"

# 查看日志
tail -f /var/log/clawnode/hook.log
```

### 问题：Hook 没有触发

```bash
# 检查 Hook 配置
cat .claude/settings.json | jq '.hooks'

# 检查脚本权限
ls -la .claude/hooks/

# 确保脚本可执行
chmod +x .claude/hooks/*.sh
```

---

## 相关文件

- `.claude/hooks/notify-openclaw.sh` - 通知脚本
- `.claude/hooks/clawnode-task-hook.sh` - 任务 Hook 脚本
- `.claude/settings.json` - Hook 配置
- `.env` - 环境变量配置
