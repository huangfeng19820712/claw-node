# Agent 自动发送到飞书配置指南

## 方案一：通过 Agent 自动发送（推荐）

### 工作原理

```
节点执行命令 → exec.finished 事件 → Gateway 事件队列 → Agent 唤醒 → 生成消息 → 飞书渠道
```

### 配置步骤

#### 1. 配置飞书渠道

编辑 `~/.openclaw/config.toml`，添加飞书渠道配置：

```toml
[[channels]]
key = "feishu"
type = "feishu"
displayName = "飞书机器人"

# 飞书应用凭证（从飞书开放平台获取）
appId = "cli_xxxxxxxxxxxx"
appSecret = "xxxxxxxxxxxxxxxx"
encryptKey = "xxxxxxxxxxxxxxxx"  # 可选，如果启用了加密
```

**获取飞书凭证：**
1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 在「凭证与基础信息」中获取 AppId 和 AppSecret
4. 在「事件订阅」中获取 Encrypt Key（如果启用加密）

#### 2. 配置会话路由

在 `~/.openclaw/config.toml` 中添加会话配置：

```toml
[[sessions]]
key = "node-exec-session"
lastChannel = "feishu"
lastTo = "oc_7026084752"  # 替换为你的飞书用户 openId 或群聊 chatId
```

**获取飞书 to 参数：**
- **单聊用户 openId**：在飞书开放平台的「API 探索者」中调用 `/contact/v1/me` 获取
- **群聊 chatId**：在飞书开放平台的「API 探索者」中调用 `/im/v1/chats` 获取
- 或者从 Gateway 日志中查看已有的会话记录

#### 3. 节点端发送事件（带 sessionKey）

节点执行命令后，需要发送带 `sessionKey` 的 `exec.finished` 事件，这样 Agent 才知道要发送到哪个会话。

编辑节点客户端代码：

```javascript
// 在 node-client.js 中添加 sendExecFinishedEvent 方法

/**
 * 发送 exec.finished 事件到 Gateway
 * @param {string} runId - 执行 ID
 * @param {string} exitCode - 退出码
 * @param {string} output - 执行输出
 * @param {string} sessionKey - 会话 key（用于路由到飞书）
 */
sendExecFinishedEvent(runId, exitCode, output, sessionKey) {
  const event = {
    type: 'event',
    event: 'exec.finished',
    payload: {
      runId: runId,
      exitCode: parseInt(exitCode) || 0,
      output: output,
      sessionKey: sessionKey,  // 关键：指定会话
    },
  };
  this.ws.send(JSON.stringify(event));
  console.log('[NodeClient] Sent exec.finished event with sessionKey:', sessionKey);
}

// 修改 system.run 的处理，实际执行命令并返回结果
async handleSystemRun(callId, params) {
  const { exec } = require('child_process');
  const { command } = params;
  const runId = `run-${Date.now()}`;
  const sessionKey = 'node-exec-session';  // 与 config.toml 中的 key 一致

  console.log('[NodeClient] Executing command:', command);

  exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
    const exitCode = error ? error.code || 1 : 0;
    const output = stdout || stderr || (error ? error.message : '');

    // 发送 exec.finished 事件（带 sessionKey）
    this.sendExecFinishedEvent(runId, exitCode, output, sessionKey);

    // 同时发送 call.result 作为响应
    this.sendToolResponse(callId, {
      success: exitCode === 0,
      exitCode,
      output,
      runId,
    });
  });
}

// 更新 handleCall 方法
handleCall(msg) {
  const { callId, name, params } = msg.payload || {};
  console.log('[NodeClient] Tool call:', name);

  switch (name) {
    case 'system.run':
      this.handleSystemRun(callId, params);
      break;

    case 'device.info':
      this.sendToolResponse(callId, {
        deviceId: this.deviceId,
        displayName: this.displayName,
        status: 'online',
      });
      break;

    default:
      this.sendToolResponse(callId, { error: 'Unknown tool: ' + name });
  }
}
```

#### 4. 测试流程

```bash
# 1. 重启 OpenClaw Gateway 使配置生效
# 在 OpenClaw 主机上
pm2 restart openclaw
# 或
openclaw restart

# 2. 从 operator 端调用 node.invoke
# 使用以下代码测试
```

创建测试脚本 `test-node-exec.js`：

```javascript
// test-node-exec.js
import { GatewayClient } from 'openclaw/plugin-sdk';

async function testNodeExec() {
  const client = await GatewayClient.connect({
    gatewayUrl: 'ws://localhost:18789',
    role: 'operator',
    scopes: ['admin'],
    // ... 认证信息
  });

  // 调用 node.invoke 执行命令
  const result = await client.request('node.invoke', {
    nodeId: 'your-node-id',
    command: 'system.run',
    params: {
      command: 'echo "Hello from node!" && date',
    },
    timeoutMs: 60000,  // 60 秒超时
  });

  console.log('Node invoke result:', result);

  // 等待几秒让事件处理完成
  await new Promise(r => setTimeout(r, 3000));
  process.exit(0);
}

testNodeExec().catch(console.error);
```

### 验证配置是否生效

#### 1. 检查 Gateway 日志

```bash
# 查看 Gateway 日志，应该看到：
tail -f ~/.openclaw/logs/gateway.log

# 期望看到的关键日志：
# - "enqueueSystemEvent: exec.finished"
# - "requestHeartbeatNow: reason=exec-event"
# - "Sending message to feishu channel"
```

#### 2. 检查 Agent 日志

```bash
tail -f ~/.openclaw/logs/agent.log

# 期望看到：
# - "Processing system event"
# - "Generated message for exec.finished event"
```

#### 3. 检查飞书消息

在飞书中应该收到类似以下消息：

```
[node] Exec finished (code 0)
Hello from node!
Thu Mar 27 10:00:00 CST 2026
```

### 常见问题排查

#### Q1: 事件发送后没有收到飞书消息

**检查清单：**
1. 确认 `sessionKey` 与 `config.toml` 中的 `[[sessions]] key` 一致
2. 确认 `lastChannel = "feishu"` 配置正确
3. 确认 `lastTo` 是有效的飞书 openId 或 chatId
4. 检查飞书应用凭证是否正确
5. 查看 Gateway 日志是否有错误

#### Q2: 飞书凭证错误

重新获取凭证并确认：
- AppId 格式：`cli_xxxxxxxxxxxx`
- AppSecret 长度：32 字符
- EncryptKey（如果使用）：32 字符

#### Q3: sessionKey 不匹配

确保节点发送的 `sessionKey` 与配置文件中的完全一致（区分大小写）。

### 进阶配置

#### 自定义 Agent 消息格式

如果需要自定义发送给飞书的消息格式，可以编写自定义 Agent 插件：

```javascript
// ~/.openclaw/plugins/node-exec-notifier/index.js
module.exports = {
  id: 'node-exec-notifier',
  name: 'Node Exec Notifier',
  version: '1.0.0',

  register(api) {
    api.onSystemEvent('exec.finished', async (event) => {
      const { runId, exitCode, output, sessionKey } = event.payload;

      // 自定义消息格式
      const message = {
        msg_type: 'interactive',
        card: {
          config: { wide_screen_mode: true },
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `**节点执行完成**\\n退出码：${exitCode}\\n\\n${output}`
              }
            }
          ]
        }
      };

      // 发送到飞书
      await api.sendToChannel('feishu', {
        to: 'oc_7026084752',
        message: message
      });
    });
  }
};
```

### 配置文件完整示例

```toml
# ~/.openclaw/config.toml

# 飞书渠道
[[channels]]
key = "feishu"
type = "feishu"
displayName = "飞书通知"
appId = "cli_a1b2c3d4e5f6"
appSecret = "xxxxxxxxxxxxxxxx"
encryptKey = "xxxxxxxxxxxxxxxx"

# 会话路由
[[sessions]]
key = "node-exec-session"
lastChannel = "feishu"
lastTo = "oc_7026084752"

# 其他配置...
[gateway]
port = 18789
host = "0.0.0.0"

[agent]
enabled = true
heartbeatInterval = 30  # 心跳间隔（秒）
```

### 总结

方案一的优势：
- ✅ 无需修改 OpenClaw 源码
- ✅ 利用现有的 Agent 机制自动处理
- ✅ 支持自定义消息格式
- ✅ 可以通过插件扩展功能

配置关键点：
1. 飞书渠道凭证配置正确
2. sessionKey 与 config.toml 中的 key 一致
3. lastTo 参数是有效的飞书 ID
4. 节点发送事件时指定 sessionKey
