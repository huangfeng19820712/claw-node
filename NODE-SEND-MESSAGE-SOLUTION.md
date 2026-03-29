# Node 节点发送消息解决方案

## 问题背景

通过测试发现，node 角色通过 WebSocket 连接到 Gateway 后：
- ✅ **认证成功**：可以使用 device token 完成 WebSocket 认证
- ❌ **权限不足**：调用 `send` 方法时返回 `unauthorized role: node` 错误

### 原因分析

从源码 `src/gateway/role-policy.ts` 的 `isRoleAuthorizedForMethod` 函数可知：

```typescript
export function isRoleAuthorizedForMethod(role: GatewayRole, method: string): boolean {
  if (isNodeRoleMethod(method)) {
    return role === "node";  // node 角色只能调用 node.* 方法
  }
  return role === "operator";  // 其他方法只允许 operator 角色调用
}
```

从 `src/gateway/method-scopes.ts` 的 `isNodeRoleMethod` 函数可知，node 角色方法包括：
- `node.invoke.result`
- `node.event`
- `node.pending.drain`
- `node.canvas.capability.refresh`
- `node.pending.pull`
- `node.pending.ack`
- `skills.bins`

**`send` 方法不在允许列表中**，这是一个架构设计上的权限限制。

---

## 解决方案

### 方案一：通过插件 HTTP 路由中转（推荐）

**原理**：创建一个插件 HTTP 端点，由插件以 operator 身份调用 `send` 方法。

**架构**：
```
Node 节点 → HTTP 请求 → 插件端点 → (operator 身份) → Gateway send 方法 → 渠道
```

**实现步骤**：

1. **在 OpenClaw 主机上创建插件**

创建文件 `~/.openclaw/plugins/node-send-proxy/index.js`：

```javascript
// node-send-proxy/index.js
module.exports = {
  id: 'node-send-proxy',
  name: 'Node Send Proxy',
  version: '1.0.0',
  description: '允许 node 节点通过 HTTP API 发送消息',

  register(api) {
    const { config } = api;

    // 注册 HTTP 路由
    api.registerHttpRoute({
      path: '/plugins/node-send-proxy/api/send',
      auth: 'plugin',  // 使用插件认证，不是 gateway 认证
      match: 'exact',
      handler: async (req, res) => {
        // 只接受 POST 请求
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
          return true;
        }

        // 验证请求 token（可选，增加安全性）
        const authHeader = req.headers.authorization || '';
        const expectedToken = config.plugins?.['node-send-proxy']?.token;
        if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
          res.statusCode = 401;
          res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
          return true;
        }

        // 收集请求体
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        let params;
        try {
          params = JSON.parse(body);
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
          return true;
        }

        // 验证必要参数
        const { to, message, channel, idempotencyKey } = params;
        if (!to || (!message && !params.mediaUrl)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'Missing required params: to, message/mediaUrl' }));
          return true;
        }

        // 调用 Gateway 的 send 方法
        // 注意：这里需要访问 Gateway 的内部方法
        // 可以通过导入 coreGatewayHandlers 来实现

        try {
          // 方法 1：如果插件 SDK 提供了调用 Gateway 方法的 API
          // const result = await api.callGatewayMethod('send', {
          //   to,
          //   message,
          //   channel,
          //   idempotencyKey: idempotencyKey || `node-proxy-${Date.now()}`
          // });

          // 方法 2：直接导入并调用 sendHandlers
          const { sendHandlers } = await import('openclaw/dist/gateway/server-methods/send.js');

          // 模拟 Gateway 请求上下文
          const mockClient = {
            connect: {
              role: 'operator',
              scopes: ['operator.write']  // 赋予 write 权限
            }
          };

          let resultPayload = null;
          let resultError = null;

          const respond = (ok, payload, error, meta) => {
            resultPayload = payload;
            resultError = error;
          };

          await sendHandlers.send({
            req: {
              method: 'send',
              params: {
                to,
                message,
                channel: channel || 'telegram',
                idempotencyKey: idempotencyKey || `node-proxy-${Date.now()}`
              }
            },
            params: {
              to,
              message,
              channel: channel || 'telegram',
              idempotencyKey: idempotencyKey || `node-proxy-${Date.now()}`
            },
            client: mockClient,
            respond
          });

          if (resultError) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: resultError }));
          } else {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, payload: resultPayload }));
          }
        } catch (err) {
          console.error('[node-send-proxy] Error calling send method:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }

        return true;
      }
    });

    console.log('[node-send-proxy] Registered at /plugins/node-send-proxy/api/send');
  }
};
```

2. **在配置中启用插件**

编辑 `~/.openclaw/config.toml`：

```toml
[[plugins]]
path = "~/.openclaw/plugins/node-send-proxy"

[plugins.node-send-proxy]
token = "your-secure-token-here"  # 可选，用于验证请求
```

3. **在 Node 节点上调用**

```javascript
// node-send-client.js
const WebSocket = require('ws');
const crypto = require('crypto');

class NodeSendClient {
  constructor(gatewayHost, deviceToken) {
    this.gatewayHost = gatewayHost;
    this.deviceToken = deviceToken;
    this.httpBaseUrl = `http://${gatewayHost}:18789`;
  }

  /**
   * 通过 HTTP 代理发送消息
   */
  async sendMessage({ to, message, channel = 'telegram', mediaUrl = null }) {
    const response = await fetch(`${this.httpBaseUrl}/plugins/node-send-proxy/api/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer your-secure-token-here`
      },
      body: JSON.stringify({
        to,
        message,
        channel,
        mediaUrl,
        idempotencyKey: `node-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`
      })
    });

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.payload;
  }
}

// 使用示例
const client = new NodeSendClient('localhost', 'your-device-token');
client.sendMessage({
  to: 'recipient_id',
  message: 'Hello from node!'
}).then(console.log).catch(console.error);
```

**优点**：
- 无需修改 OpenClaw 源码
- 安全性高（可配置 token 验证）
- 灵活性高（可添加日志、限流等功能）

**缺点**：
- 需要额外创建插件文件
- 需要访问 Gateway 内部模块（可能需要调整导入路径）

---

### 方案二：通过 node.invoke 调用节点本地命令（不推荐）

**原理**：利用 `node.invoke` 方法在节点上执行本地命令。

**架构**：
```
Operator → Gateway → node.invoke → Node 节点执行命令 → 渠道
```

**重要说明**：`node.invoke` 是在**节点机器上**执行命令，不是在 Gateway 上。

从源码 `src/gateway/server-methods/nodes.ts` 可知：
- Gateway 通过 WebSocket 将 `node.invoke` 请求转发给已连接的 Node 节点
- Node 节点在本地执行命令（如 `system.run` 执行 shell 命令）
- 执行结果返回给 Gateway

**实现步骤**：

1. **在节点上安装 OpenClaw CLI**

```bash
npm install -g openclaw-cli
```

2. **配置节点上的渠道凭证**

节点需要有自己的渠道配置（如 Telegram Bot Token）才能发送消息。

3. **从 Operator 端调用**

```typescript
// Operator 通过 Gateway 调用 node.invoke
const result = await gateway.call('node.invoke', {
  nodeId: 'your-node-id',
  command: 'system.run',
  params: {
    command: ['openclaw', 'send', '--to', 'recipient', '--message', 'Hello']
  }
});
```

**优点**：
- 使用现有的 node.invoke 机制
- 不需要额外插件

**缺点**：
- 节点需要安装完整的 OpenClaw CLI
- 节点需要配置自己的渠道凭证
- **只能由 operator 主动触发，node 不能主动发送**
- 不适用于"node 角色需要主动向用户发送消息"的场景

---

### 方案三：修改角色策略（需要修改源码）

**原理**：修改 `src/gateway/role-policy.ts`，允许 node 角色调用 `send` 方法。

**实现步骤**：

1. 编辑 `src/gateway/role-policy.ts`：

```typescript
const NODE_ROLE_METHODS = new Set([
  "node.invoke.result",
  "node.event",
  "node.pending.drain",
  "node.canvas.capability.refresh",
  "node.pending.pull",
  "node.pending.ack",
  "skills.bins",
  "send",  // 添加这一行
  "poll",  // 如果需要发送投票
]);
```

2. 或者修改 `isRoleAuthorizedForMethod` 函数：

```typescript
export function isRoleAuthorizedForMethod(role: GatewayRole, method: string): boolean {
  if (isNodeRoleMethod(method)) {
    return role === "node";
  }
  // 允许 node 角色调用 send 方法
  if (role === "node" && method === "send") {
    return true;
  }
  return role === "operator";
}
```

3. 重新编译并部署

**优点**：
- 直接解决问题
- 不需要额外的代理层

**缺点**：
- 需要修改源码并重新编译
- 改变了原有的安全模型（node 角色获得了发送权限）
- 可能需要限制 node 角色只能发送到特定渠道

---

### 方案四：使用 registerGatewayMethod 注册自定义方法

**原理**：通过插件注册一个新的 Gateway 方法，该方法内部调用 send。

**实现步骤**：

1. **创建插件**

```javascript
// node-send-method/index.js
module.exports = {
  id: 'node-send-method',
  name: 'Node Send Method',
  version: '1.0.0',

  async register(api) {
    // 导入 send handler
    const { sendHandlers } = await import('openclaw/dist/gateway/server-methods/send.js');

    // 注册自定义 Gateway 方法
    api.registerGatewayMethod('node.send', async ({ params, respond, client }) => {
      // 验证调用者是 node 角色
      const role = client?.connect?.role;
      if (role !== 'node') {
        respond(false, undefined, {
          code: 'INVALID_REQUEST',
          message: 'node.send can only be called by node role'
        });
        return;
      }

      // 验证参数
      const { to, message, channel, idempotencyKey } = params;
      if (!to || (!message && !params.mediaUrl)) {
        respond(false, undefined, {
          code: 'INVALID_REQUEST',
          message: 'Missing required params: to, message/mediaUrl'
        });
        return;
      }

      // 使用 operator 身份调用原始 send 方法
      const operatorClient = {
        connect: {
          role: 'operator',
          scopes: ['operator.write']
        }
      };

      let resultPayload = null;
      let resultError = null;

      const respondWrapper = (ok, payload, error, meta) => {
        resultPayload = payload;
        resultError = error;
      };

      await sendHandlers.send({
        req: { method: 'send', params },
        params,
        client: operatorClient,
        respond: respondWrapper
      });

      if (resultError) {
        respond(false, undefined, resultError);
      } else {
        respond(true, resultPayload);
      }
    });

    console.log('[node-send-method] Registered as node.send');
  }
};
```

2. **在节点上调用**

```javascript
// 节点通过 WebSocket call 帧调用
ws.send(JSON.stringify({
  kind: 'call',
  name: 'node.send',
  params: {
    to: 'recipient_id',
    message: 'Hello from node!',
    channel: 'telegram',
    idempotencyKey: 'node-123'
  },
  id: 'call-1'
}));
```

**优点**：
- 无需修改核心源码
- 通过插件扩展功能
- 保持了权限控制（只有 node 角色能调用）

**缺点**：
- 插件需要访问 Gateway 内部模块
- 需要插件系统支持 `registerGatewayMethod`

---

## 推荐方案

**首选方案一（插件 HTTP 路由中转）**：

1. 安全性高：通过 token 验证请求
2. 灵活性强：可以添加限流、日志、审计等功能
3. 不侵入核心：不需要修改 OpenClaw 源码
4. 易于维护：插件代码独立，便于调试和更新
5. **支持 node 主动发送**：node 可以直接调用 HTTP 端点

**备选方案四（registerGatewayMethod）**：

如果插件 SDK 的 `registerGatewayMethod` API 可以正常工作，这是更优雅的解决方案，因为：
- 直接通过 WebSocket call 帧调用
- 不需要额外的 HTTP 层
- 保持了统一的协议风格
- **支持 node 主动发送**

**方案二不推荐**：
- 只能由 operator 触发，node 不能主动发送
- 需要节点安装 CLI 并配置渠道凭证
- 不适合"node 主动向用户发送消息"的场景

---

## 实现检查清单

- [ ] 确认插件 SDK 是否支持 `registerGatewayMethod`
- [ ] 确认 `sendHandlers` 是否可以被外部导入
- [ ] 测试 HTTP 路由方案的可行性
- [ ] 评估安全影响（node 发送消息的权限边界）
- [ ] 选择最终方案并实现

---

## 附录：相关源码位置

- 角色策略：`src/gateway/role-policy.ts`
- 方法作用域：`src/gateway/method-scopes.ts`
- 请求授权：`src/gateway/server-methods.ts`
- send 处理器：`src/gateway/server-methods/send.ts`
- 插件 SDK 类型：`src/plugins/types.ts`
- 插件注册器：`src/plugins/registry.ts`
