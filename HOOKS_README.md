# Hooks 配置说明

## 依赖要求

### 必需工具
- **bash** - Git Bash for Windows（Claude Code 在 Windows 上必需）
- **jq** - JSON 处理工具（安装：`choco install jq` 或下载 https://stedolan.github.io/jq/download/）

### 验证安装
```bash
# 检查 bash
bash --version

# 检查 jq
jq --version
```

## 路径说明

Hook 脚本中使用的环境变量：
- `$CLAUDE_PROJECT_DIR` - 项目根目录（由 Claude Code 自动设置）
- `$CLAUDE_ENV_FILE` - 环境变量文件路径
- `$ERROR_REPORTING_URL` - 错误上报 URL（可选）

## 日志目录

日志文件生成在两个位置：

| 脚本 | 日志路径 |
|------|----------|
| session-init, session-cleanup | `$CLAUDE_PROJECT_DIR/.logs/sessions.log` |
| file-change-log, file-change-report | `$CLAUDE_PROJECT_DIR/.logs/file-changes.log` |
| command-audit | `$CLAUDE_PROJECT_DIR/.logs/command-audit.jsonl` |
| error-handler | `$CLAUDE_PROJECT_DIR/.logs/errors.log` |
| api-error-report | `$CLAUDE_PROJECT_DIR/.logs/api-errors.jsonl` |

注意：在 Windows 上运行测试时，需要手动设置 `CLAUDE_PROJECT_DIR` 环境变量。

## 测试方法

### 方法 1：使用测试脚本
```bash
# 设置环境变量
export CLAUDE_PROJECT_DIR="E:/fwwork/javaws/claw-node"

# 运行测试
bash test/test-hooks.sh
```

### 方法 2：手动测试单个脚本
```bash
export CLAUDE_PROJECT_DIR="E:/fwwork/javaws/claw-node"

# 测试安全检查
echo '{"tool_input": {"command": "ls -la"}}' | jq -c . | bash .claude/hooks/security-check.sh

# 测试会话初始化
echo '{"session_id": "test-123"}' | jq -c . | bash .claude/hooks/session-init.sh

# 查看日志
cat .logs/sessions.log
cat .logs/file-changes.log
```

## Windows 特别说明

在 Windows CMD 或 PowerShell 中测试时：

```powershell
# PowerShell 设置环境变量
$env:CLAUDE_PROJECT_DIR="E:/fwwork/javaws/claw-node"

# 使用 Git Bash 运行脚本
"C:\Program Files\Git\bin\bash.exe" test/test-hooks.sh
```

## 故障排除

### jq: command not found
安装 jq：
- Windows (Chocolatey): `choco install jq`
- Windows (手动): 下载 https://github.com/jqlang/jq/releases 放到 PATH 中
- macOS (Homebrew): `brew install jq`
- Linux (apt): `apt install jq`

### 日志文件没有生成
1. 确认 `CLAUDE_PROJECT_DIR` 环境变量已设置
2. 确认目录有写权限
3. 检查脚本中的路径是否正确

### 脚本执行权限问题
```bash
chmod +x .claude/hooks/*.sh
```

## 与 ClawNode 集成

ClawNode 的 Executor 模块可以调用这些 Hook 脚本：

```typescript
// src/modules/executor.ts
async execute(task: Task): Promise<ExecutionResult> {
  // 执行前 Hook
  await this.triggerHook('PreToolUse', { command: task.prompt })

  // 执行 Claude Code
  const result = await this.runClaudeCode(task)

  // 执行后 Hook
  await this.triggerHook('PostToolUse', result)

  return result
}
```
