#!/bin/bash
# PreToolUse hook - 记录文件变更

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# 记录变更
echo "[$(date -Iseconds)] $TOOL_NAME: $FILE_PATH" >> "$CLAUDE_PROJECT_DIR/.logs/file-changes.log"

exit 0
