#!/bin/bash
# 获取 Gateway 设备 Token
#
# 用法：bash test/get-device-token.sh <invite-code>

set -uo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:18789}"

echo "======================================"
echo "  获取 Gateway 设备 Token"
echo "======================================"
echo ""

# 检查是否提供了邀请码
if [ -z "$1" ]; then
    echo "用法：$0 <invite-code>"
    echo ""
    echo "如何获取邀请码:"
    echo "  1. 在 Gateway 服务器上执行:"
    echo "     docker exec -it openclaw-container bash"
    echo "     node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js my-node"
    echo ""
    echo "  2. 复制输出的 Invite Code"
    echo ""
    exit 1
fi

INVITE_CODE="$1"

echo "请求设备 Token..."
echo "Gateway URL: $GATEWAY_URL"
echo "邀请码：${INVITE_CODE:0:20}..."
echo ""

# 调用 API
RESPONSE=$(curl -s "$GATEWAY_URL/plugins/node-auto-register/api/one-shot-pair?inviteCode=$INVITE_CODE")

# 解析响应
echo "响应:"
echo "$RESPONSE" | jq .

# 检查是否成功
OK=$(echo "$RESPONSE" | jq -r '.ok')

if [ "$OK" = "true" ]; then
    DEVICE_TOKEN=$(echo "$RESPONSE" | jq -r '.deviceToken')
    DEVICE_ID=$(echo "$RESPONSE" | jq -r '.deviceId')
    ROLE=$(echo "$RESPONSE" | jq -r '.role')

    echo ""
    echo "======================================"
    echo "  获取成功!"
    echo "======================================"
    echo ""
    echo "请将以下配置添加到 .env 文件:"
    echo "--------------------------------------"
    echo "DEVICE_TOKEN=$DEVICE_TOKEN"
    echo "DEVICE_ID=$DEVICE_ID"
    echo "--------------------------------------"
    echo ""
    echo "下一步:"
    echo "  1. 运行 npx clawnode ws-generate-keys 生成密钥对"
    echo "  2. 将 DEVICE_TOKEN 和 DEVICE_ID 配置到 .env"
    echo "  3. 运行 node test/test-gateway-auth.js 测试认证和消息发送"
    echo ""
else
    echo ""
    echo "======================================"
    echo "  获取失败!"
    echo "======================================"
    echo ""
    ERROR=$(echo "$RESPONSE" | jq -r '.error')
    echo "错误信息：$ERROR"
    echo ""
fi
