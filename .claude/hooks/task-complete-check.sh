#!/bin/bash
# Stop hook - 检查任务是否真正完成

INPUT=$(cat)
LAST_MESSAGE=$(echo "$INPUT" | jq -r '.last_assistant_message // empty')

# 检查是否还有待办事项
if [[ "$LAST_MESSAGE" == *"还需要"* ]] || \
   [[ "$LAST_MESSAGE" == *"接下来"* ]] || \
   [[ "$LAST_MESSAGE" == *"TODO"* ]]; then
  jq -n '{
    "decision": "block",
    "reason": "检测到还有待办事项，请确认所有任务已完成"
  }'
  exit 0
fi

# 通过检查
exit 0
