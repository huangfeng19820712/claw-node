# WebSocket Send 测试指南

## 测试前准备

### 1. 获取认证凭证

```bash
# 步骤 1: 生成密钥对
npx clawnode ws-generate-keys

# 保存输出的 PUBLIC_KEY 和 PRIVATE_KEY
```

### 步骤 2: 在 Gateway 上获取设备 Token

```bash
# 在 Gateway 服务器上执行
docker exec -it openclaw-container bash

# 生成邀请码
node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js test-node

# 获取设备 token
curl "http://localhost:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=<上面生成的邀请码>"
```

### 步骤 3: 配置 .env

```bash
cp .env.example .env
```

编辑 `.env`，添加：

```bash
# WebSocket 配置
GATEWAY_HOST=192.168.1.100    # Gateway IP
GATEWAY_PORT=18789
DEVICE_TOKEN=<从上一步获取的 device-token>
DEVICE_ID=<从上一步获取的 device-id>
PRIVATE_KEY=<从 ws-generate-keys 获取的私钥>
PUBLIC_KEY=<从 ws-generate-keys 获取的公钥>
```

## 测试命令

### 测试 1：发送 WhatsApp 消息

```bash
npx clawnode ws-send \
  --to "+8613800138000" \
  --message "🔍 ClawNode WebSocket 测试消息

这是一条测试消息，用于验证 WebSocket 连接和消息发送功能是否正常。

时间：$(date)" \
  --channel whatsapp
```

### 测试 2：发送 Telegram 消息

```bash
npx clawnode ws-send \
  --to "@your-username" \
  --message "👋 Hello from ClawNode!

测试时间：$(date)
测试内容：WebSocket send 功能验证" \
  --channel telegram
```

### 测试 3：发送到群组

```bash
npx clawnode ws-send \
  --to "@team-group" \
  --message "📢 团队通知

测试内容：WebSocket 群发消息功能
发送时间：$(date)" \
  --channel telegram
```

## 预期输出

成功时：
```
[ClawNode] Connecting to ws://192.168.1.100:18789...
[ClawNode] Connected successfully
[ClawNode] Sending message to +8613800138000 via whatsapp...
[ClawNode] Message sent successfully!
Result:
  Message ID: BAE5F4C8D9E0A1B2C3D4
  Channel: whatsapp
  To JID: 8613800138000@s.whatsapp.net
```

失败时（常见错误）：
```
[ClawNode] Send failed: Connection timeout
# 或
[ClawNode] Send failed: device signature invalid
# 或
[ClawNode] Send failed: channel not configured
```

## 故障排除

### 错误 1: Connection timeout

**原因**：无法连接到 Gateway

**解决**：
1. 检查 Gateway 是否运行：`docker ps | grep openclaw`
2. 检查端口是否开放：`telnet gateway-ip 18789`
3. 检查防火墙设置

### 错误 2: device signature invalid

**原因**：密钥格式错误或签名验证失败

**解决**：
1. 重新生成密钥对：`npx clawnode ws-generate-keys`
2. 确保 PRIVATE_KEY 和 PUBLIC_KEY 配置正确
3. 检查是否是 base64url 格式（不含 `+` `/` `=`）

### 错误 3: device token invalid

**原因**：设备 Token 无效或过期

**解决**：
1. 重新获取设备 Token
2. 确保 device-token 和 device-id 匹配

### 错误 4: channel not configured

**原因**：Gateway 未配置该渠道

**解决**：
1. 在 Gateway 上检查渠道状态：`openclaw channels status`
2. 配置对应渠道的账号

## 编程接口测试

创建测试文件 `test/websocket-test.js`：

```javascript
import { WebSocketSender } from '../dist/modules/websocket-sender.js'

async function test() {
  const sender = new WebSocketSender({
    gatewayHost: process.env.GATEWAY_HOST || 'localhost',
    gatewayPort: parseInt(process.env.GATEWAY_PORT || '18789'),
    deviceToken: process.env.DEVICE_TOKEN,
    deviceId: process.env.DEVICE_ID,
    privateKey: process.env.PRIVATE_KEY,
    publicKey: process.env.PUBLIC_KEY,
  })

  try {
    await sender.connect()
    console.log('✓ Connected')

    const result = await sender.sendMessage(
      '+8613800138000',
      'Test message from ClawNode!',
      { channel: 'whatsapp' }
    )
    console.log('✓ Message sent:', result)

    sender.disconnect()
    console.log('✓ Disconnected')
  } catch (error) {
    console.error('✗ Error:', error.message)
    sender.disconnect()
    process.exit(1)
  }
}

test()
```

运行测试：

```bash
node test/websocket-test.js
```

## 性能测试

测试并发发送：

```bash
# 同时发送 10 条消息
for i in {1..10}; do
  npx clawnode ws-send \
    --to "+861380013800$i" \
    --message "测试消息 $i" \
    --channel whatsapp &
done

wait
echo "All messages sent"
```

## 相关文档

- [WEBSOCKET_SEND_GUIDE.md](WEBSOCKET_SEND_GUIDE.md) - 完整使用指南
- [WEBSOCKET-SEND-IMPLEMENTATION.md](WEBSOCKET-SEND-IMPLEMENTATION.md) - 实现原理
