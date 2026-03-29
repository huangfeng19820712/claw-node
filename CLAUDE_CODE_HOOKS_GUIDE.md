# Claude Code Hooks 配置指南

## 概述

Claude Code Hooks 是在 Claude Code 生命周期特定点自动执行的 shell 命令、HTTP 端点或 LLM 提示。本文档总结了所有可用的 Hook 事件和配置方法。

## Hook 事件完整列表（24 个）

### 会话生命周期事件

| 事件 | 触发时机 | 匹配器 | 可阻止 |
|------|----------|--------|--------|
| `SessionStart` | 会话开始/恢复 | startup/resume/clear/compact | 否 |
| `SessionEnd` | 会话结束 | clear/resume/logout/other | 否 |
| `InstructionsLoaded` | 加载 CLAUDE.md 时 | session_start/path_glob_match 等 | 否 |
| `ConfigChange` | 配置文件更改 | user_settings/project_settings 等 | 是 |

### 用户交互事件

| 事件 | 触发时机 | 匹配器 | 可阻止 |
|------|----------|--------|--------|
| `UserPromptSubmit` | 用户提交提示时 | 无 | 是 |
| `Notification` | 发送通知时 | permission_prompt/idle_prompt 等 | 否 |
| `Stop` | Claude 完成响应时 | 无 | 是 |
| `StopFailure` | API 错误时 | rate_limit/authentication_failed 等 | 否 |

### 工具执行事件

| 事件 | 触发时机 | 匹配器 | 可阻止 |
|------|----------|--------|--------|
| `PreToolUse` | 工具调用前 | Bash/Edit/Write/Read 等 | 是 |
| `PermissionRequest` | 权限对话框显示时 | Bash/Edit/Write 等 | 是 |
| `PostToolUse` | 工具成功完成后 | Bash/Edit/Write 等 | 否 |
| `PostToolUseFailure` | 工具失败后 | Bash/Edit/Write 等 | 否 |

### Subagent 事件

| 事件 | 触发时机 | 匹配器 | 可阻止 |
|------|----------|--------|--------|
| `SubagentStart` | 生成 subagent 时 | Bash/Explore/Plan 等 | 否 |
| `SubagentStop` | subagent 完成时 | Bash/Explore/Plan 等 | 是 |

### 压缩事件

| 事件 | 触发时机 | 匹配器 | 可阻止 |
|------|----------|--------|--------|
| `PreCompact` | 压缩前 | manual/auto | 否 |
| `PostCompact` | 压缩后 | manual/auto | 否 |

### Worktree 事件

| 事件 | 触发时机 | 匹配器 | 可阻止 |
|------|----------|--------|--------|
| `WorktreeCreate` | 创建 worktree 时 | 无 | 是 |
| `WorktreeRemove` | 移除 worktree 时 | 无 | 否 |

### 代理团队事件

| 事件 | 触发时机 | 匹配器 | 可阻止 |
|------|----------|--------|--------|
| `TeammateIdle` | 队友即将空闲 | 无 | 是 |
| `TaskCompleted` | 任务被标记完成 | 无 | 是 |

### MCP 事件

| 事件 | 触发时机 | 匹配器 | 可阻止 |
|------|----------|--------|--------|
| `Elicitation` | MCP 请求用户输入 | MCP 服务器名 | 是 |
| `ElicitationResult` | 用户响应 MCP 后 | MCP 服务器名 | 是 |

## 配置位置

| 文件 | 范围 | 可共享 |
|------|------|--------|
| `~/.claude/settings.json` | 所有项目 | 否 |
| `.claude/settings.json` | 单个项目 | 是（可提交） |
| `.claude/settings.local.json` | 单个项目 | 否（gitignored） |

## 配置结构

```json
{
  "hooks": {
    "事件名": [
      {
        "matcher": "正则表达式",
        "hooks": [
          {
            "type": "command|http|prompt|agent",
            "command": "shell 命令",
            "url": "http 端点",
            "prompt": "LLM 提示",
            "timeout": 超时秒数,
            "async": true/false
          }
        ]
      }
    ]
  }
}
```

## Hook 处理程序类型

### 1. Command Hook

```json
{
  "type": "command",
  "command": ".claude/hooks/check-security.sh",
  "timeout": 60,
  "async": false
}
```

### 2. HTTP Hook

```json
{
  "type": "http",
  "url": "http://localhost:8080/hooks/validate",
  "headers": {
    "Authorization": "Bearer $TOKEN"
  },
  "allowedEnvVars": ["TOKEN"],
  "timeout": 30
}
```

### 3. Prompt Hook

```json
{
  "type": "prompt",
  "prompt": "验证是否应该允许此操作：$ARGUMENTS",
  "model": "haiku",
  "timeout": 30
}
```

### 4. Agent Hook

```json
{
  "type": "agent",
  "prompt": "检查代码库验证条件",
  "timeout": 120
}
```

## 实用配置示例

### 示例 1：阻止危险命令

`.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/block-rm.sh"
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/block-rm.sh`:
```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command' < /dev/stdin)

if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Destructive command blocked by hook"
    }
  }'
else
  exit 0
fi
```

### 示例 2：文件修改后运行测试

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/run-tests.sh",
            "async": true,
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

### 示例 3：HTTP 回调通知

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:8080/hooks/audit",
            "headers": {
              "Authorization": "Bearer $AUDIT_TOKEN"
            },
            "allowedEnvVars": ["AUDIT_TOKEN"]
          }
        ]
      }
    ]
  }
}
```

### 示例 4：基于提示的验证

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "检查所有任务是否完成：$ARGUMENTS",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## 输出控制

### 退出代码

| 退出码 | 含义 |
|--------|------|
| `0` | 成功，继续执行 |
| `2` | 阻止错误，阻止操作 |
| 其他 | 非阻止错误，继续执行 |

### JSON 输出格式

**通用控制：**
```json
{
  "continue": false,
  "stopReason": "原因说明",
  "suppressOutput": true,
  "systemMessage": "用户警告消息"
}
```

**PreToolUse 决定控制：**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask",
    "permissionDecisionReason": "原因",
    "updatedInput": {"command": "新命令"},
    "additionalContext": "额外上下文"
  }
}
```

**PermissionRequest 决定控制：**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow|deny",
      "updatedInput": {"command": "新命令"},
      "message": "拒绝原因"
    }
  }
}
```

## 环境变量

| 变量 | 描述 |
|------|------|
| `$CLAUDE_PROJECT_DIR` | 项目根目录 |
| `$CLAUDE_PLUGIN_ROOT` | 插件安装目录 |
| `$CLAUDE_PLUGIN_DATA` | 插件持久数据目录 |
| `$CLAUDE_CODE_REMOTE` | 远程环境设为"true" |
| `$CLAUDE_ENV_FILE` | SessionStart hooks 可设置环境变量 |

## 调试

```bash
# 启用调试模式
claude --debug

# 查看 hook 执行详情
claude --debug hooks

# 切换详细模式
Ctrl+O
```

## 与 ClawNode 集成

ClawNode 可以利用 Claude Code 的 Hook 机制：

1. **在 Claude Code 侧配置 Hooks** - 捕获工具事件
2. **在 ClawNode 侧配置回调** - 通过任务 `hooks` 字段

示例流程：
```
用户请求 → ClawNode 接收任务 → Claude Code 执行
                              ├─ PreToolUse Hook → 审计日志
                              ├─ PostToolUse Hook → 验证结果
                              └─ Stop Hook → 完成检查
                         ↓
                    ClawNode 回调 → OpenClaw
```
