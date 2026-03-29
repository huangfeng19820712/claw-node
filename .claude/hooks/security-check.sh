#!/bin/bash
# PreToolUse hook - Bash 命令安全检查

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# 定义危险命令黑名单
DANGEROUS_PATTERNS=(
  "rm -rf /"
  "dd if=/dev/zero"
  ":(){:|:&};:"
  "mkfs"
  "chmod -R 777 /"
  "curl.*\|.*bash"
  "wget.*\|.*bash"
)

# 检查黑名单
for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if [[ "$COMMAND" =~ $pattern ]]; then
    jq -n '{
      "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "命令包含危险操作：'"$pattern"'"
      }
    }'
    exit 0
  fi
done

# 检查敏感文件路径
SENSITIVE_PATHS=("/etc/passwd" "/etc/shadow" "~/.ssh" "/root/")
for path in "${SENSITIVE_PATHS[@]}"; do
  if [[ "$COMMAND" == *"$path"* ]]; then
    jq -n '{
      "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "ask",
        "permissionDecisionReason": "命令访问敏感路径：'"$path"'"
      }
    }'
    exit 0
  fi
done

# 通过检查
exit 0
