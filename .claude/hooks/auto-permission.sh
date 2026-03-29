#!/bin/bash
# PermissionRequest hook - 自动处理权限请求

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# 安全命令自动批准
SAFE_COMMANDS=("ls" "cat" "grep" "echo" "pwd" "git status" "npm test" "npm run build")

for safe in "${SAFE_COMMANDS[@]}"; do
  if [[ "$COMMAND" == "$safe"* ]]; then
    jq -n '{
      "hookSpecificOutput": {
        "hookEventName": "PermissionRequest",
        "decision": {
          "behavior": "allow"
        }
      }
    }'
    exit 0
  fi
done

# 其他命令交给用户决定
exit 0
