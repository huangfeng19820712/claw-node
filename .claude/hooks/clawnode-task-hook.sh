#!/bin/bash
# ClawNode 任务 Hook - 在任务执行的关键节点触发
# 用途：记录日志、发送通知、触发回调

set -uo pipefail

# 配置
LOG_FILE="${LOG_FILE:-.logs/task-hook.log}"
CALLBACK_URL="${CLAWNODE_CALLBACK_URL:-}"
NOTIFY_SCRIPT="${CLAWNODE_NOTIFY_SCRIPT:-}"

# 确保日志目录存在
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

log "=== ClawNode Task Hook ==="

# 读取输入
INPUT=$(cat)

if [ -z "$INPUT" ]; then
    log "No input received"
    exit 0
fi

log "Input: $INPUT"

# 解析数据
TASK_ID=$(echo "$INPUT" | jq -r '.taskId // empty')
EVENT=$(echo "$INPUT" | jq -r '.event // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.sessionId // empty')

if [ -z "$TASK_ID" ]; then
    log "Missing taskId, skipping"
    exit 0
fi

# 1. 写入本地日志
echo "$INPUT" | jq --arg ts "$(date -Iseconds)" '. + {logged_at: $ts}' >> .logs/task-events.jsonl 2>/dev/null || true
log "Event logged for task $TASK_ID"

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
        -d "$INPUT" > /dev/null 2>&1 &
fi

# 4. 如果是 Session 相关事件，写入 Session 日志
if [ -n "$SESSION_ID" ]; then
    echo "$INPUT" | jq --arg ts "$(date -Iseconds)" '. + {logged_at: $ts}' >> ".logs/session-${SESSION_ID}.jsonl" 2>/dev/null || true
    log "Event logged to session file"
fi

log "=== Hook completed ==="
exit 0
