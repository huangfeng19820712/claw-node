#!/bin/bash
# 测试 OpenClaw 通知 Hook

set -e

echo "======================================"
echo "   测试 OpenClaw 通知 Hook"
echo "======================================"
echo ""

HOOK_SCRIPT=".claude/hooks/notify-openclaw.sh"
LOG_FILE=".logs/test-notify.log"

# 检查脚本是否存在
if [ ! -f "$HOOK_SCRIPT" ]; then
    echo "❌ Hook 脚本不存在：$HOOK_SCRIPT"
    exit 1
fi

# 检查脚本权限
if [ ! -x "$HOOK_SCRIPT" ]; then
    echo "❌ Hook 脚本没有执行权限"
    exit 1
fi

echo "✓ Hook 脚本检查通过"
echo ""

# 测试用例 1：任务开始
echo "--- 测试 1: 任务开始 ---"
export LOG_FILE="$LOG_FILE"
echo '{"taskId": "test-001", "event": "start", "data": {"status": "RUNNING", "nodeId": "node-001"}}' | bash "$HOOK_SCRIPT"
echo "✓ 任务开始测试完成"
echo ""

# 测试用例 2：任务完成
echo "--- 测试 2: 任务完成 ---"
echo '{"taskId": "test-002", "event": "complete", "data": {"status": "SUCCESS", "nodeId": "node-001", "output": "项目创建完成！生成了以下文件：package.json, src/index.js"}}' | bash "$HOOK_SCRIPT"
echo "✓ 任务完成测试完成"
echo ""

# 测试用例 3：任务失败
echo "--- 测试 3: 任务失败 ---"
echo '{"taskId": "test-003", "event": "error", "data": {"status": "FAILED", "nodeId": "node-001", "error": "npm install failed: ENOSPC No space left on device"}}' | bash "$HOOK_SCRIPT"
echo "✓ 任务失败测试完成"
echo ""

# 测试用例 4：带 Session 的任务
echo "--- 测试 4: 带 Session 的任务 ---"
echo '{"taskId": "test-004", "event": "complete", "data": {"status": "SUCCESS", "nodeId": "node-001", "sessionId": "session-abc-123", "output": "功能开发完成"}}' | bash "$HOOK_SCRIPT"
echo "✓ 带 Session 的任务测试完成"
echo ""

# 查看日志
echo "--- 查看日志 ---"
if [ -f "$LOG_FILE" ]; then
    echo "日志内容："
    cat "$LOG_FILE"
else
    echo "日志文件不存在（这可能是正常的，如果没有配置日志）"
fi

echo ""
echo "======================================"
echo "   测试完成"
echo "======================================"
echo ""
echo "注意：由于没有配置 OPENCLAW_BIN 和 NOTIFY_TARGET，"
echo "消息实际上没有发送，只是写入了日志文件。"
echo ""
echo "要测试实际发送，请设置环境变量："
echo "  export OPENCLAW_BIN=/path/to/openclaw"
echo "  export NOTIFY_TARGET=@your-group"
echo "  export NOTIFY_CHANNEL=telegram"
