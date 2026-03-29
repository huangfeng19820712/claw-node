#!/bin/bash
# PostToolUseFailure hook - 工具失败处理

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
ERROR=$(echo "$INPUT" | jq -r '.error')

# 记录错误
echo "[$(date -Iseconds)] $TOOL_NAME 失败：$ERROR" >> "$CLAUDE_PROJECT_DIR/.logs/errors.log"

# 根据错误类型决定是否需要额外上下文
if [[ "$ERROR" == *"timeout"* ]]; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PostToolUseFailure",
      "additionalContext": "命令超时，可能需要增加 timeout 参数或优化命令"
    }
  }'
elif [[ "$ERROR" == *"permission denied"* ]]; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PostToolUseFailure",
      "additionalContext": "权限被拒绝，检查文件权限或使用 sudo"
    }
  }'
else
  exit 0
fi
