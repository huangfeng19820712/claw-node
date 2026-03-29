#!/bin/bash
# StopFailure hook - API 错误上报

INPUT=$(cat)
ERROR=$(echo "$INPUT" | jq -r '.error')
ERROR_DETAILS=$(echo "$INPUT" | jq -r '.error_details // empty')

# 发送错误报告（异步）
REPORT=$(jq -n \
  --arg ts "$(date -Iseconds)" \
  --arg err "$ERROR" \
  --arg details "$ERROR_DETAILS" \
  '{timestamp: $ts, error: $err, details: $details}')

# 发送到错误收集服务（如果配置了）
if [ -n "$ERROR_REPORTING_URL" ]; then
  curl -s -X POST "$ERROR_REPORTING_URL" \
    -H "Content-Type: application/json" \
    -d "$REPORT" > /dev/null &
fi

# 记录本地日志
echo "$REPORT" >> "$CLAUDE_PROJECT_DIR/.logs/api-errors.jsonl"

exit 0
