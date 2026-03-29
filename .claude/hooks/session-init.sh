#!/bin/bash
# SessionStart hook - 初始化执行环境

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')

# 设置环境变量
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo "export CLAWNODE_SESSION_ID=$SESSION_ID" >> "$CLAUDE_ENV_FILE"
  echo "export CLAWNODE_START_TIME=$(date +%s)" >> "$CLAUDE_ENV_FILE"
fi

# 记录会话开始
echo "[$(date -Iseconds)] Session $SESSION_ID started" >> "$CLAUDE_PROJECT_DIR/.logs/sessions.log"

exit 0
