#!/bin/bash
# PostToolUse hook - 文件变更报告

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
RESPONSE=$(echo "$INPUT" | jq -r '.tool_response')

# 记录文件变更报告
echo "[$(date -Iseconds)] $TOOL_NAME 修改了 $FILE_PATH" >> "$CLAUDE_PROJECT_DIR/.logs/file-changes.log"

# 如果是测试相关，自动运行测试
if [[ "$FILE_PATH" == *".test.ts"* ]] || [[ "$FILE_PATH" == *".spec.ts"* ]]; then
  echo "[$(date -Iseconds)] 检测到测试文件变更，建议运行测试" >> "$CLAUDE_PROJECT_DIR/.logs/file-changes.log"
fi

exit 0
