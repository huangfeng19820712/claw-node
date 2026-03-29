#!/bin/bash
# Hook 脚本测试工具

echo "======================================"
echo "   ClawNode Hook 脚本测试"
echo "======================================"
echo ""

# 使用项目根目录（Windows 路径转换）
PROJECT_DIR="E:/fwwork/javaws/claw-node"
HOOKS_DIR="$PROJECT_DIR/.claude/hooks"
TEST_PASSED=0
TEST_FAILED=0

# 测试函数
test_hook() {
  local name="$1"
  local script="$2"
  local input="$3"
  local expected_exit="$4"

  echo -n "测试 $name ... "

  if [ ! -f "$script" ]; then
    echo "失败 (脚本不存在)"
    ((TEST_FAILED++))
    return 1
  fi

  if [ ! -x "$script" ]; then
    echo "失败 (没有执行权限)"
    ((TEST_FAILED++))
    return 1
  fi

  echo "$input" | bash "$script" > /dev/null 2>&1
  exit_code=$?

  if [ "$exit_code" -eq "$expected_exit" ]; then
    echo "通过 (exit=$exit_code)"
    ((TEST_PASSED++))
    return 0
  else
    echo "失败 (期望 exit=$expected_exit, 实际 exit=$exit_code)"
    ((TEST_FAILED++))
    return 1
  fi
}

# 测试 session-init.sh
echo "--- SessionStart Hooks ---"
test_hook "session-init.sh" \
  "$HOOKS_DIR/session-init.sh" \
  '{"session_id": "test-123"}' \
  0

# 测试 security-check.sh
echo ""
echo "--- PreToolUse Hooks ---"
test_hook "security-check.sh (安全命令)" \
  "$HOOKS_DIR/security-check.sh" \
  '{"tool_input": {"command": "ls -la"}}' \
  0

test_hook "security-check.sh (危险命令)" \
  "$HOOKS_DIR/security-check.sh" \
  '{"tool_input": {"command": "rm -rf /"}}' \
  0

# 测试 file-change-log.sh
test_hook "file-change-log.sh" \
  "$HOOKS_DIR/file-change-log.sh" \
  '{"tool_input": {"file_path": "/test/file.txt"}, "tool_name": "Write"}' \
  0

# 测试 auto-permission.sh
echo ""
echo "--- PermissionRequest Hooks ---"
test_hook "auto-permission.sh (安全命令)" \
  "$HOOKS_DIR/auto-permission.sh" \
  '{"tool_name": "Bash", "tool_input": {"command": "ls -la"}}' \
  0

test_hook "auto-permission.sh (其他命令)" \
  "$HOOKS_DIR/auto-permission.sh" \
  '{"tool_name": "Bash", "tool_input": {"command": "rm file.txt"}}' \
  0

# 测试 command-audit.sh
echo ""
echo "--- PostToolUse Hooks ---"
test_hook "command-audit.sh" \
  "$HOOKS_DIR/command-audit.sh" \
  '{"tool_input": {"command": "ls"}, "tool_response": {"exit_code": 0}}' \
  0

test_hook "file-change-report.sh" \
  "$HOOKS_DIR/file-change-report.sh" \
  '{"tool_input": {"file_path": "/test/file.txt"}, "tool_name": "Write", "tool_response": {}}' \
  0

# 测试 error-handler.sh
echo ""
echo "--- PostToolUseFailure Hooks ---"
test_hook "error-handler.sh (超时错误)" \
  "$HOOKS_DIR/error-handler.sh" \
  '{"tool_name": "Bash", "error": "timeout"}' \
  0

test_hook "error-handler.sh (权限错误)" \
  "$HOOKS_DIR/error-handler.sh" \
  '{"tool_name": "Bash", "error": "permission denied"}' \
  0

# 测试 task-complete-check.sh
echo ""
echo "--- Stop Hooks ---"
test_hook "task-complete-check.sh (任务完成)" \
  "$HOOKS_DIR/task-complete-check.sh" \
  '{"last_assistant_message": "任务已完成"}' \
  0

test_hook "task-complete-check.sh (还有待办)" \
  "$HOOKS_DIR/task-complete-check.sh" \
  '{"last_assistant_message": "还需要做以下几件事..."}' \
  0

# 测试 StopFailure hooks
echo ""
echo "--- StopFailure Hooks ---"
test_hook "api-error-report.sh" \
  "$HOOKS_DIR/api-error-report.sh" \
  '{"error": "API Error", "error_details": "Rate limited"}' \
  0

# 测试 SessionEnd hooks
echo ""
echo "--- SessionEnd Hooks ---"
test_hook "session-cleanup.sh" \
  "$HOOKS_DIR/session-cleanup.sh" \
  '{"reason": "user_request"}' \
  0

# 总结
echo ""
echo "======================================"
echo "   测试结果汇总"
echo "======================================"
echo "通过：$TEST_PASSED"
echo "失败：$TEST_FAILED"
echo ""

if [ "$TEST_FAILED" -eq 0 ]; then
  echo "✓ 所有测试通过!"
  exit 0
else
  echo "✗ 部分测试失败，请检查输出"
  exit 1
fi
