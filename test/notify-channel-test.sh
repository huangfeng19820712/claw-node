#!/bin/bash
# ClawNode 通知渠道测试脚本
# 用法：bash test/notify-channel-test.sh

set -uo pipefail

echo "======================================"
echo "  ClawNode 通知渠道测试"
echo "======================================"
echo ""

# 加载 .env 配置
if [ -f ".env" ]; then
    echo "✓ 加载 .env 配置..."
    export $(grep -v '^#' .env | xargs -0 2>/dev/null || true)
fi

# 配置
OPENCLAW_BIN="${OPENCLAW_BIN:-openclaw}"
CHANNEL="${NOTIFY_CHANNEL:-telegram}"
TARGET="${NOTIFY_TARGET:-@test-group}"
LOG_FILE=".logs/notify-test.log"

# 确保日志目录存在
mkdir -p .logs

echo ""
echo "配置信息:"
echo "  OPENCLAW_BIN: $OPENCLAW_BIN"
echo "  NOTIFY_CHANNEL: $CHANNEL"
echo "  NOTIFY_TARGET: $TARGET"
echo ""

# 检查 openclaw 是否可用
echo "步骤 1: 检查 openclaw CLI..."
if command -v "$OPENCLAW_BIN" &> /dev/null; then
    echo "  ✓ openclaw 可用：$(which $OPENCLAW_BIN)"
    OPENCLAW_AVAILABLE=true
else
    echo "  ✗ openclaw 不可用：$OPENCLAW_BIN"
    echo "  提示：请确认 OPENCLAW_BIN 配置正确，或 openclaw 已安装"
    OPENCLAW_AVAILABLE=false
fi

echo ""
echo "步骤 2: 测试发送消息..."

# 测试消息
TEST_MESSAGE="🔍 ClawNode 测试消息

这是一条测试消息，用于验证通知渠道配置是否正确。

时间：$(date)
节点：test-node
任务 ID：test-$(date +%s)

如果收到此消息，说明通知渠道配置正常！"

if [ "$OPENCLAW_AVAILABLE" = true ]; then
    echo ""
    echo "发送测试消息到 $CHANNEL -> $TARGET..."
    echo ""

    # 执行发送
    $OPENCLAW_BIN message send \
        --channel "$CHANNEL" \
        --target "$TARGET" \
        --message "$TEST_MESSAGE"

    EXIT_CODE=$?
    echo ""

    if [ $EXIT_CODE -eq 0 ]; then
        echo "✓ 测试消息发送成功！"
        echo ""
        echo "======================================"
        echo "  测试结果：✓ 通过"
        echo "======================================"
        echo ""
        echo "请在渠道 $CHANNEL ($TARGET) 中检查是否收到消息。"
        echo ""
    else
        echo "✗ 测试消息发送失败 (退出码：$EXIT_CODE)"
        echo ""
        echo "======================================"
        echo "  测试结果：✗ 失败"
        echo "======================================"
        echo ""
        echo "可能的原因:"
        echo "  1. 渠道配置不正确"
        echo "  2. 目标群组/用户不存在"
        echo "  3. openclaw CLI 配置问题"
        echo ""
        echo "建议检查:"
        echo "  - .env 中的 NOTIFY_CHANNEL 和 NOTIFY_TARGET"
        echo "  - openclaw CLI 的渠道配置"
        echo ""
    fi
else
    echo ""
    echo "======================================"
    echo "  测试结果：⚠ 跳过（openclaw 不可用）"
    echo "======================================"
    echo ""
    echo "测试消息内容（未发送）:"
    echo "--------------------------------------"
    echo "$TEST_MESSAGE"
    echo "--------------------------------------"
    echo ""
    echo "提示：安装 openclaw CLI 或配置正确的 OPENCLAW_BIN 路径后再试"
fi

# 写入日志
echo "[$(date -Iseconds)] Test completed with exit code: $EXIT_CODE" >> "$LOG_FILE"

exit $EXIT_CODE
