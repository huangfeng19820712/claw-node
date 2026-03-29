# ClawNode Hooks 配置方案

## 一、需求分析

### ClawNode 核心流程

```
OpenClaw → ClawNode → Claude Code → 回调 OpenClaw
              ↓
         Hooks 监控点
```

### 需要监控的关键点

| 监控点 | 目的 | 对应 Claude Code Hook |
|--------|------|----------------------|
| 任务执行开始 | 记录执行起点 | `SessionStart` |
| 工具调用前 | 安全审查、命令白名单 | `PreToolUse` |
| 权限请求 | 自动批准/拒绝 | `PermissionRequest` |
| 工具执行后 | 验证结果、记录审计 | `PostToolUse` |
| 工具执行失败 | 错误处理、重试判断 | `PostToolUseFailure` |
| Claude 完成响应 | 任务完成检查 | `Stop` |
| API 错误 | 错误上报 | `StopFailure` |
| 会话结束 | 清理资源、上报统计 | `SessionEnd` |

---

## 二、推荐配置的 Hook 事件（8 个）

### 必需配置（5 个）

1. **`PreToolUse`** - 工具调用前审查（安全关键）
2. **`PostToolUse`** - 工具执行后验证（结果记录）
3. **`Stop`** - 任务完成检查（状态确认）
4. **`SessionStart`** - 会话初始化（环境设置）
5. **`SessionEnd`** - 会话清理（资源回收）

### 建议配置（3 个）

6. **`PermissionRequest`** - 权限自动处理
7. **`PostToolUseFailure`** - 错误处理
8. **`StopFailure`** - API 错误上报

---

## 三、具体配置方案

### 项目级配置文件：`.claude/settings.json`

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-init.sh",
            "timeout": 30
          }
        ]
      }
    ],

    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/security-check.sh",
            "timeout": 30
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/file-change-log.sh",
            "timeout": 30
          }
        ]
      }
    ],

    "PermissionRequest": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/auto-permission.sh",
            "timeout": 15
          }
        ]
      }
    ],

    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/command-audit.sh",
            "async": true,
            "timeout": 60
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/file-change-report.sh",
            "async": true,
            "timeout": 60
          }
        ]
      }
    ],

    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/error-handler.sh",
            "timeout": 30
          }
        ]
      }
    ],

    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/task-complete-check.sh",
            "timeout": 30
          }
        ]
      }
    ],

    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/api-error-report.sh",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ],

    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-cleanup.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

---

## 四、Hook 脚本实现

### 1. 会话初始化：`.claude/hooks/session-init.sh`

```bash
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
```

### 2. 安全检查：`.claude/hooks/security-check.sh`

```bash
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
```

### 3. 文件变更日志：`.claude/hooks/file-change-log.sh`

```bash
#!/bin/bash
# PreToolUse hook - 记录文件变更

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')

# 记录变更
echo "[$(date -Iseconds)] $TOOL_NAME: $FILE_PATH" >> "$CLAUDE_PROJECT_DIR/.logs/file-changes.log"

exit 0
```

### 4. 自动权限处理：`.claude/hooks/auto-permission.sh`

```bash
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
```

### 5. 命令审计：`.claude/hooks/command-audit.sh`

```bash
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
```

### 6. 错误处理：`.claude/hooks/error-handler.sh`

```bash
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
```

### 7. 任务完成检查：`.claude/hooks/task-complete-check.sh`

```bash
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
```

### 8. API 错误上报：`.claude/hooks/api-error-report.sh`

```bash
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
```

### 9. 会话清理：`.claude/hooks/session-cleanup.sh`

```bash
#!/bin/bash
# SessionEnd hook - 会话清理

INPUT=$(cat)
REASON=$(echo "$INPUT" | jq -r '.reason')

# 清理临时文件
rm -f /tmp/claude-$$.tmp 2>/dev/null

# 记录会话结束
echo "[$(date -Iseconds)] Session ended: $REASON" >> "$CLAUDE_PROJECT_DIR/.logs/sessions.log"

exit 0
```

---

## 五、目录结构

```
.claude/
├── settings.json              # 项目级 Hooks 配置
├── hooks/                     # Hook 脚本目录
│   ├── session-init.sh
│   ├── security-check.sh
│   ├── file-change-log.sh
│   ├── auto-permission.sh
│   ├── command-audit.sh
│   ├── error-handler.sh
│   ├── task-complete-check.sh
│   ├── api-error-report.sh
│   └── session-cleanup.sh
└── rules/                     # 可选：自定义规则
    └── security-rules.md
```

---

## 六、ClawNode 需要做的调整

### 1. 与 Claude Code Hooks 的集成点

```
┌─────────────────────────────────────────────────────────┐
│                    ClawNode                             │
│  ┌──────────┐     ┌──────────┐     ┌────────────────┐ │
│  │ Executor │────>│  Claude  │────>│ Hooks 执行     │ │
│  │          │     │  Code    │     │ - 安全检查     │ │
│  └──────────┘     └──────────┘     │ - 审计日志     │ │
│                                      │ - 结果验证     │ │
│                                      └────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2. 代码调整建议

**Executor 模块增强：**

```typescript
// src/modules/executor.ts 添加
export interface HookConfig {
  enabled: boolean
  events: string[]
  scripts: Record<string, string>
}

// 在 execute 方法中添加 hook 调用
async execute(task: Task, onOutput?: (output: string) => void): Promise<ExecutionResult> {
  // 执行前检查
  if (this.config.hooks.enabled) {
    await this.triggerPreExecuteHooks(task)
  }

  // ... 执行逻辑

  // 执行后验证
  if (this.config.hooks.enabled) {
    await this.triggerPostExecuteHooks(task, result)
  }

  return result
}
```

### 3. 日志系统集成

将 Hook 产生的日志与 ClawNode 现有日志系统集成：

```typescript
// src/utils/logger.ts 添加 hook 日志方法
hook(event: string, data: unknown): void {
  this.info(`[HOOK] ${event}`, data)
}
```

---

## 七、部署步骤

### 1. 创建配置文件

```bash
mkdir -p .claude/hooks .claude/logs

# 复制配置文件
cp .claude/settings.json.example .claude/settings.json

# 复制 Hook 脚本
cp .claude/hooks/*.sh.example .claude/hooks/
chmod +x .claude/hooks/*.sh
```

### 2. 配置环境变量

```bash
# .env 添加
ERROR_REPORTING_URL=http://your-server.com/api/errors
AUDIT_LOG_PATH=/var/log/clawnode/
```

### 3. 测试 Hook 配置

```bash
# 列出所有配置的 Hooks
claude /hooks

# 测试单个 Hook
claude --debug hooks
```

---

## 八、监控与告警

### 推荐的监控指标

| 指标 | 阈值 | 告警方式 |
|------|------|----------|
| Hook 执行失败率 | > 5% | 邮件/Slack |
| 命令阻止次数 | 单次会话 > 3 | 实时通知 |
| API 错误率 | > 1% | 邮件/Slack |
| 平均执行时间 | > 60 秒 | 周报 |

---

## 九、安全注意事项

1. **脚本权限**：Hook 脚本应设置为仅可执行，不可写
2. **输入验证**：所有从 stdin 读取的 JSON 都应验证
3. **路径引用**：使用 `$CLAUDE_PROJECT_DIR` 引用项目路径
4. **敏感信息**：不要在日志中记录 API Key 等敏感信息
