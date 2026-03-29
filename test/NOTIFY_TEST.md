# 通知渠道测试

## 快速测试方法

### 方法 1：使用测试脚本

```bash
# 赋予执行权限
chmod +x test/notify-channel-test.sh

# 运行测试
bash test/notify-channel-test.sh
```

### 方法 2：直接发送测试消息

```bash
# 加载 .env 配置
source .env

# 发送测试消息
openclaw message send \
  --channel "$NOTIFY_CHANNEL" \
  --target "$NOTIFY_TARGET" \
  --message "🔍 ClawNode 测试消息

时间：$(date)
如果收到此消息，说明通知渠道配置正常！"
```

### 方法 3：使用 ClawNode CLI 测试

```bash
# 执行一个简单任务并发送通知
npx clawnode run "输出当前日期和时间"
```

## 配置检查清单

在运行测试前，请确认 `.env` 配置正确：

```bash
# 必需配置
OPENCLAW_BIN=/path/to/openclaw    # openclaw CLI 路径
NOTIFY_CHANNEL=telegram           # 渠道类型
NOTIFY_TARGET=@your-group         # 目标群组

# 可选配置
LOG_FILE=.logs/clawnode-hook.log  # 日志路径
```

## 支持的渠道

| 渠道 | NOTIFY_CHANNEL 值 |
|------|------------------|
| Telegram | `telegram` |
| 钉钉 | `dingtalk` |
| 企业微信 | `wecom` 或 `wechat` |
| 飞书 | `feishu` 或 `lark` |

## 故障排除

### 问题：openclaw 命令找不到

```bash
# 检查 openclaw 是否安装
which openclaw

# 如果不在 PATH 中，使用完整路径
export OPENCLAW_BIN=/home/ubuntu/.npm-global/bin/openclaw
```

### 问题：消息发送失败

1. 检查渠道配置是否正确
2. 确认目标群组存在且有权限发送
3. 查看详细日志：`cat .logs/clawnode-hook.log`

### 问题：收不到通知

检查 Hook 脚本日志：
```bash
tail -f .logs/task-events.jsonl
tail -f .logs/clawnode-hook.log
```
