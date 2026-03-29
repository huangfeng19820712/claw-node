# Gateway 连通性测试指南

## 快速开始

### 步骤 1：测试 Gateway 连通性

```bash
node test/test-gateway-connection.js
```

预期输出：
```
✓ WebSocket 连接成功!
✓ 收到 connect.challenge，Gateway 响应正常!
连通性测试通过！
```

### 步骤 2：生成 ED25519 密钥对

```bash
npx clawnode ws-generate-keys
```

输出示例：
```
ED25519 Key Pair Generated:
====================================
PUBLIC_KEY=gqklshSBsdIP-Ef_3J-MYV3ybGS6z8LBOl7WzuhzM5o
------------------------------------
PRIVATE_KEY=qE-1DXql_OOJVGsh77z8dj9Cei0wIE0XpQ3qnXFiKbI
====================================
```

**妥善保管 PRIVATE_KEY！**

### 步骤 3：获取设备 Token

在 Gateway 服务器上执行：

```bash
# 1. 生成邀请码
docker exec -it openclaw-container bash
node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js test-node

# 输出示例：
# Invite Code: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 2. 获取设备 token（在本地执行）
bash test/get-device-token.sh <invite-code>
```

或者手动调用 API：

```bash
curl "http://localhost:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=<你的邀请码>"
```

响应示例：
```json
{
  "ok": true,
  "deviceToken": "device-token-xxx",
  "deviceId": "device-id-xxx",
  "role": "node"
}
```

### 步骤 4：配置环境变量

创建或编辑 `.env` 文件：

```bash
# 复制示例配置
cp .env.example .env

# 编辑 .env，添加以下内容
DEVICE_TOKEN=<从步骤 3 获取的 device-token>
DEVICE_ID=<从步骤 3 获取的 device-id>
PRIVATE_KEY=<从步骤 2 获取的私钥>
PUBLIC_KEY=<从步骤 2 获取的公钥>
```

### 步骤 5：测试认证和消息发送

```bash
node test/test-gateway-auth.js
```

或者通过命令行参数：

```bash
node test/test-gateway-auth.js \
  localhost \          # Gateway 主机
  18789 \              # Gateway 端口
  <device-token> \     # 设备 Token
  <device-id> \        # 设备 ID
  <private-key> \      # 私钥 (base64url)
  <public-key>         # 公钥 (base64url)
```

### 步骤 6：使用 CLI 发送消息

配置完成后，可以直接使用 CLI 发送消息：

```bash
# 发送到 WhatsApp
npx clawnode ws-send \
  --to "+8613800138000" \
  --message "Hello from ClawNode!" \
  --channel whatsapp

# 发送到 Telegram
npx clawnode ws-send \
  --to "@username" \
  --message "Hello from ClawNode!" \
  --channel telegram
```

## 故障排除

### 问题 1：连接超时

```
✗ 连接超时 (10 秒)
```

**解决**：
1. 确认 Gateway 已启动：`docker ps | grep openclaw`
2. 检查端口是否可访问：`telnet localhost 18789`
3. 检查防火墙设置

### 问题 2：认证失败 "device signature invalid"

**解决**：
1. 重新生成密钥对
2. 确保 PRIVATE_KEY 和 PUBLIC_KEY 配置正确
3. 检查是否是 base64url 格式（不含 `+` `/` `=`）

### 问题 3：设备 token 无效

**解决**：
1. 确认邀请码未过期
2. 确认邀请码未被使用（one-shot-pair 只能使用一次）
3. 重新生成邀请码并获取设备 token

### 问题 4：渠道未配置

```
Error: channel not configured
```

**解决**：
1. 在 Gateway 上检查渠道状态
2. 配置对应渠道的账号

## 脚本说明

### test/test-gateway-connection.js
测试与 Gateway 的 WebSocket 连通性，不需要认证。

### test/get-device-token.sh
通过邀请码获取设备 Token 和 Device ID。

### test/test-gateway-auth.js
完整的认证和消息发送测试。

## 相关文档

- [WEBSOCKET_SEND_GUIDE.md](WEBSOCKET_SEND_GUIDE.md) - WebSocket 发送完整指南
- [WEBSOCKET-SEND-IMPLEMENTATION.md](WEBSOCKET-SEND-IMPLEMENTATION.md) - 实现原理
