#!/bin/bash
# SessionEnd hook - 会话清理

INPUT=$(cat)
REASON=$(echo "$INPUT" | jq -r '.reason')

# 清理临时文件
rm -f /tmp/claude-$$.tmp 2>/dev/null

# 记录会话结束
echo "[$(date -Iseconds)] Session ended: $REASON" >> "$CLAUDE_PROJECT_DIR/.logs/sessions.log"

exit 0
