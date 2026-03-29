# Hooks 部署完成

## 已创建的文件

### 配置文件
- `.claude/settings.json` - Hooks 主配置文件

### Hook 脚本（10 个）
| 文件名 | 对应事件 | 用途 |
|--------|----------|------|
| `session-init.sh` | SessionStart | 会话初始化 |
| `security-check.sh` | PreToolUse | Bash 命令安全检查 |
| `file-change-log.sh` | PreToolUse | 文件变更日志 |
| `auto-permission.sh` | PermissionRequest | 自动权限处理 |
| `command-audit.sh` | PostToolUse | 异步命令审计 |
| `file-change-report.sh` | PostToolUse | 文件变更报告 |
| `error-handler.sh` | PostToolUseFailure | 错误处理 |
| `task-complete-check.sh` | Stop | 任务完成检查 |
| `api-error-report.sh` | StopFailure | API 错误上报 |
| `session-cleanup.sh` | SessionEnd | 会话清理 |

### 规则文档
- `.claude/rules/security-rules.md` - 安全规则说明

## 目录结构

```
.cloude/
├── settings.json              # Hooks 配置
├── hooks/                     # Hook 脚本
│   ├── session-init.sh
│   ├── security-check.sh
│   ├── file-change-log.sh
│   ├── auto-permission.sh
│   ├── command-audit.sh
│   ├── file-change-report.sh
│   ├── error-handler.sh
│   ├── task-complete-check.sh
│   ├── api-error-report.sh
│   └── session-cleanup.sh
├── rules/
│   └── security-rules.md      # 安全规则
└── logs/                      # 日志目录（运行时生成）
    ├── sessions.log
    ├── file-changes.log
    ├── command-audit.jsonl
    ├── errors.log
    └── api-errors.jsonl
```

## 验证步骤

### 1. 检查脚本权限
```bash
ls -la .claude/hooks/
```
所有脚本应具有可执行权限（-rwxr-xr-x）

### 2. 检查 JSON 配置
```bash
jq . .claude/settings.json
```
确保 JSON 格式正确

### 3. 测试单个 Hook 脚本
```bash
# 测试安全检查
echo '{"tool_input": {"command": "ls -la"}}' | .claude/hooks/security-check.sh

# 测试会话初始化
echo '{"session_id": "test-123"}' | .claude/hooks/session-init.sh
```

### 4. 在 Claude Code 中验证
```bash
# 列出所有配置的 Hooks
claude /hooks

# 测试模式运行
claude --debug hooks
```

## 配置说明

### 8 个 Hook 事件

| 事件 | 数量 | 用途 |
|------|------|------|
| SessionStart | 1 | 会话开始初始化 |
| PreToolUse | 2 | 工具调用前审查（Bash + 文件） |
| PermissionRequest | 1 | 权限自动处理 |
| PostToolUse | 2 | 工具执行后审计（Bash + 文件） |
| PostToolUseFailure | 1 | 错误处理 |
| Stop | 1 | 任务完成检查 |
| StopFailure | 1 | API 错误上报 |
| SessionEnd | 1 | 会话清理 |

### 同步 vs 异步

| 类型 | Hook 脚本 |
|------|-----------|
| **同步** | session-init, security-check, file-change-log, auto-permission, error-handler, task-complete-check, session-cleanup |
| **异步** | command-audit, file-change-report, api-error-report |

异步 Hook 不会阻塞主流程，适合耗时操作。

## 日志文件说明

运行后会生成以下日志：

- `sessions.log` - 会话开始/结束记录
- `file-changes.log` - 文件修改历史
- `command-audit.jsonl` - 命令执行审计（JSONL 格式）
- `errors.log` - 错误日志
- `api-errors.jsonl` - API 错误记录

## 环境变量

可在 `.env` 文件中配置：

```bash
# 错误上报 URL（可选）
ERROR_REPORTING_URL=http://your-server.com/api/errors

# 日志目录（可选）
AUDIT_LOG_PATH=/var/log/clawnode/
```

## 下一步

1. 运行 `claude /hooks` 验证配置
2. 执行简单命令测试 Hook 是否触发
3. 检查日志文件确认记录正确
4. 根据需要调整安全规则

## 故障排除

### Hook 没有触发？
1. 检查 `.claude/settings.json` 是否在正确位置
2. 确认 JSON 格式正确
3. 检查脚本是否有执行权限

### 脚本执行失败？
1. 查看 `.logs/errors.log`
2. 手动测试脚本：`echo '{}' | .claude/hooks/xxx.sh`
3. 检查依赖（jq、bash）

### 需要更多调试信息？
```bash
claude --debug
claude --debug hooks
```
