#!/bin/bash
# ClawNode 飞书通知渠道测试脚本
# 用法：bash test/test-feishu-notify.sh

set -uo pipefail

echo "======================================"
echo "  ClawNode 飞书通知渠道测试"
echo "======================================"
echo ""

# 加载 .env 配置
if [ -f ".env" ]; then
    echo "✓ 加载 .env 配置..."
    export $(grep -v '^#' .env | xargs -0 2>/dev/null || true)
fi

# 配置 - 使用你提供的飞书配置
OPENCLAW_BIN="${OPENCLAW_BIN:-openclaw}"
CHANNEL="feishu"
ACCOUNT="manager"
TARGET="${NOTIFY_TARGET:-ou_f83886ae0d75c6b709967d289d6a46e3}"

echo ""
echo "配置信息:"
echo "  OPENCLAW_BIN: $OPENCLAW_BIN"
echo "  CHANNEL: $CHANNEL"
echo "  ACCOUNT: $ACCOUNT"
echo "  TARGET: $TARGET"
echo ""

# 检查 openclaw 是否可用
echo "步骤 1: 检查 openclaw CLI..."
if command -v "$OPENCLAW_BIN" &> /dev/null; then
    echo "  ✓ openclaw 可用：$(which $OPENCLAW_BIN)"
    OPENCLAW_AVAILABLE=true
else
    echo "  ✗ openclaw 不可用：$OPENCLAW_BIN"
    echo "  提示：请确认 openclaw 已正确安装"
    OPENCLAW_AVAILABLE=false
fi

echo ""
echo "步骤 2: 测试发送简单消息..."

# 测试消息 1 - 简单消息
SIMPLE_MESSAGE="🔍 ClawNode 测试消息

如果收到此消息，说明飞书通知渠道配置正常！

时间：$(date)
测试类型：飞书渠道连通性测试"

if [ "$OPENCLAW_AVAILABLE" = true ]; then
    echo ""
    echo "发送测试消息到飞书 -> $TARGET..."
    echo ""

    # 执行发送
    $OPENCLAW_BIN message send \
        --channel "$CHANNEL" \
        --account "$ACCOUNT" \
        --target "$TARGET" \
        --message "$SIMPLE_MESSAGE"

    EXIT_CODE=$?
    echo ""

    if [ $EXIT_CODE -eq 0 ]; then
        echo "✓ 测试消息发送成功！"
    else
        echo "✗ 测试消息发送失败 (退出码：$EXIT_CODE)"
    fi
else
    echo ""
    echo "======================================"
    echo "  测试结果：⚠ 跳过（openclaw 不可用）"
    echo "======================================"
    echo ""
    echo "测试消息内容（未发送）:"
    echo "--------------------------------------"
    echo "$SIMPLE_MESSAGE"
    echo "--------------------------------------"
    exit 1
fi

echo ""
echo "步骤 3: 测试发送任务开始通知格式..."

# 测试消息 2 - 任务开始通知
TASK_ID="test-$(date +%s)"
START_MESSAGE="🚀 *ClawNode 任务开始执行*

📋 **任务 ID**: \`$TASK_ID\`
🖥️ **节点**: \`test-node\`
📊 **状态**: \`RUNNING\`
📝 **提示**: 测试飞书通知格式"

$OPENCLAW_BIN message send \
    --channel "$CHANNEL" \
    --account "$ACCOUNT" \
    --target "$TARGET" \
    --message "$START_MESSAGE"

echo "✓ 任务开始通知格式测试完成"

echo ""
echo "步骤 4: 测试发送任务完成通知格式..."

# 测试消息 3 - 任务完成通知
COMPLETE_MESSAGE="✅ *ClawNode 任务完成*

📋 **任务 ID**: \`$TASK_ID\`
🖥️ **节点**: \`test-node\`
📊 **状态**: \`SUCCESS\`
📝 **执行摘要**:
\`\`\`
测试任务执行完成
飞书渠道通知功能验证成功
\`\`\`"

$OPENCLAW_BIN message send \
    --channel "$CHANNEL" \
    --account "$ACCOUNT" \
    --target "$TARGET" \
    --message "$COMPLETE_MESSAGE"

echo "✓ 任务完成通知格式测试完成"

echo ""
echo "======================================"
echo "  测试结果汇总"
echo "======================================"
echo ""
echo "✓ 所有测试消息已发送"
echo ""
echo "请在飞书中检查是否收到以下消息:"
echo "  1. 简单测试消息"
echo "  2. 任务开始通知（带格式）"
echo "  3. 任务完成通知（带格式）"
echo ""
echo "如果收到全部 3 条消息，说明飞书通知渠道配置完全正常！"
echo ""

exit 0
