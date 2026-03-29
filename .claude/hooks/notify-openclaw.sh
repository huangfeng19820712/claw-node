#!/bin/bash
# ClawNode Hook: 任务状态通知 OpenClaw 渠道
# 触发时机：任务开始、执行中、完成、失败
#
# 配置：
#   OPENCLAW_BIN    - openclaw CLI 路径，默认：openclaw
#   NOTIFY_CHANNEL  - 渠道类型：telegram/dingtalk/wecom/feishu
#   NOTIFY_TARGET   - 目标群组或用户
#   LOG_FILE        - 日志文件路径

set -uo pipefail

# 默认配置
OPENCLAW_BIN="${OPENCLAW_BIN:-openclaw}"
CHANNEL="${NOTIFY_CHANNEL:-feishu}"
ACCOUNT="${NOTIFY_ACCOUNT:-}"
TARGET="${NOTIFY_TARGET:-}"
LOG_FILE="${LOG_FILE:-.logs/clawnode-hook.log}"

# 确保日志目录存在
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

log "=== ClawNode Notify Hook ==="

# 读取任务数据：优先从环境变量指定的文件读取，否则从 stdin 读取
INPUT=""
if [ -n "${CLAWNODE_HOOK_INPUT:-}" ] && [ -f "$CLAWNODE_HOOK_INPUT" ]; then
    INPUT=$(cat "$CLAWNODE_HOOK_INPUT" 2>/dev/null || true)
    log "Reading from file: $CLAWNODE_HOOK_INPUT"
elif ! [ -t 0 ]; then
    INPUT=$(timeout 2 cat /dev/stdin 2>/dev/null || true)
fi

if [ -z "$INPUT" ]; then
    log "No input received, skipping"
    exit 0
fi

log "Input received: ${#INPUT} bytes"

# 使用 Python 解析 JSON（兼容没有 jq 的环境）
parse_json() {
    local key="$1"
    echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print('$key'.replace('.','').split()[0]=='key' and d.get('$key') or d.get(*'$key'.split('.')))" 2>/dev/null || echo ""
}

TASK_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('taskId','unknown'))" 2>/dev/null || echo "unknown")
EVENT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('event','unknown'))" 2>/dev/null || echo "unknown")
DATA_STATUS=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('status','unknown'))" 2>/dev/null || echo "unknown")
OUTPUT=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('output',''))" 2>/dev/null || echo "")
ERROR=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('error',''))" 2>/dev/null || echo "")
NODE_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('nodeId','unknown'))" 2>/dev/null || echo "unknown")
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('sessionId',''))" 2>/dev/null || echo "")

STATUS="$DATA_STATUS"

log "task=$TASK_ID event=$EVENT status=$STATUS node=$NODE_ID"

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

    # 基础消息
    local msg="${emoji} *ClawNode ${title}*

📋 **任务 ID**: \`${TASK_ID}\`
🖥️ **节点**: \`${NODE_ID}\`
📊 **状态**: \`${STATUS}\`"

    # 添加 Session ID（如果有）
    if [ -n "$SESSION_ID" ]; then
        msg="${msg}
🔗 **Session**: \`${SESSION_ID}\`"
    fi

    # 添加输出摘要（如果有）
    if [ -n "$OUTPUT" ]; then
        local summary=$(echo "$OUTPUT" | tail -c 500 | tr '\n' ' ' | head -c 400)
        if [ -n "$summary" ]; then
            msg="${msg}

📝 **执行摘要**:
\`\`\`
${summary}
\`\`\`"
        fi
    fi

    # 添加错误信息（如果是 error 事件）
    if [ "$EVENT" = "error" ] && [ -n "$ERROR" ]; then
        local err_summary=$(echo "$ERROR" | head -c 200)
        msg="${msg}

⚠️ **错误信息**:
\`\`\`
${err_summary}
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
        echo "$INPUT" | jq --arg msg "$message" '.message = $msg' > /tmp/clawnode-notify.json 2>/dev/null || true
        return 0
    fi

    # 检查 openclaw 是否可用
    if ! command -v "$OPENCLAW_BIN" &> /dev/null; then
        log "openclaw command not found: $OPENCLAW_BIN"
        # 降级：写入文件
        echo "$message" > /tmp/clawnode-message.txt
        return 0
    fi

    # 发送消息
    log "Sending message via $CHANNEL to $TARGET (account: $ACCOUNT)"

    if [ -n "$ACCOUNT" ]; then
        $OPENCLAW_BIN message send \
            --channel "$CHANNEL" \
            --account "$ACCOUNT" \
            --target "$TARGET" \
            --message "$message" 2>&1 | tee -a "$LOG_FILE"
    else
        $OPENCLAW_BIN message send \
            --channel "$CHANNEL" \
            --target "$TARGET" \
            --message "$message" 2>&1 | tee -a "$LOG_FILE"
    fi

    local exit_code=${PIPESTATUS[0]}

    if [ $exit_code -eq 0 ]; then
        log "Notification sent successfully"
    else
        log "Failed to send notification (exit code: $exit_code)"
    fi

    return $exit_code
}

# 写入事件日志
echo "$INPUT" | jq --arg ts "$(date -Iseconds)" '. + {logged_at: $ts}' >> .logs/task-events.jsonl 2>/dev/null || true

# 主流程
MESSAGE=$(build_message)
log "Message built (${#MESSAGE} chars)"

# 发送通知
send_notification "$MESSAGE"

log "=== Hook completed ==="
exit 0
