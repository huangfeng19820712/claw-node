#!/bin/bash
# PostToolUse hook - 异步审计命令执行

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
RESPONSE=$(echo "$INPUT" | jq -r '.tool_response')
EXIT_CODE=$(echo "$RESPONSE" | jq -r '.exit_code // 0')

# 记录审计日志
LOG_ENTRY=$(jq -n \
  --arg ts "$(date -Iseconds)" \
  --arg cmd "$COMMAND" \
  --argjson code "$EXIT_CODE" \
  '{timestamp: $ts, command: $cmd, exit_code: $code}')

echo "$LOG_ENTRY" >> "$CLAUDE_PROJECT_DIR/.logs/command-audit.jsonl"

# 失败时通知
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "[$(date -Iseconds)] 命令执行失败：$COMMAND" >> "$CLAUDE_PROJECT_DIR/.logs/errors.log"
fi

exit 0
