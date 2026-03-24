# ClawNode 环境依赖与风险评估

## 一、环境依赖清单

### 1. 基础环境（必需）

| 依赖项 | 版本要求 | 用途 | 是否已满足 |
|--------|----------|------|------------|
| Node.js | >= 18.0.0 | 运行环境 | ✅ 已安装 (v22.13.1) |
| npm | >= 9.0.0 | 包管理 | ✅ 已安装 (v10.9.2) |

### 2. 项目依赖（已通过 npm 安装）

#### 生产依赖
| 包名 | 版本 | 用途 |
|------|------|------|
| axios | ^1.6.0 | HTTP 请求 |
| commander | ^11.1.0 | CLI 框架 |
| dotenv | ^16.3.1 | 环境变量 |
| express | ^4.18.2 | Web 服务器 |
| uuid | ^9.0.1 | UUID 生成 |

#### 开发/测试依赖
| 包名 | 版本 | 用途 |
|------|------|------|
| typescript | ^5.3.2 | TypeScript 编译 |
| ts-node | ^10.9.2 | TypeScript 运行时 |
| jest | ^29.7.0 | 测试框架 |
| ts-jest | ^29.1.1 | TypeScript + Jest |
| supertest | ^7.2.2 | HTTP 测试 |
| @types/* | - | 类型定义 |

### 3. 外部服务依赖（可选，用于完整功能）

| 服务 | 用途 | 测试影响 |
|------|------|----------|
| OpenClaw 服务器 | 任务分发 | 单元测试不需要，E2E 测试需要 Mock |
| Claude Code | 代码执行 | 单元测试不需要，集成测试需要 Mock |

### 4. 端口需求

| 端口 | 用途 | 是否可配置 |
|------|------|------------|
| 3001 | Hook 回调服务（默认） | ✅ 可配置 |
| 9999 | Mock OpenClaw 服务器（测试用） | ✅ 可配置 |

---

## 二、风险评估

### 低风险操作（安全）

✅ **单元测试** - 完全隔离，使用 Mock，不影响任何外部系统
```bash
npm test
```

✅ **构建编译** - 只在本地生成 dist 目录
```bash
npm run build
```

✅ **CLI 命令测试** - 只读操作
```bash
npx clawnode status
npx clawnode config
npx clawnode --help
```

### 中风险操作（需要注意）

⚠️ **启动 Mock 服务器** - 占用端口，可能与其他服务冲突
```bash
node test/mocks/openclaw-server.js
```
**风险缓解：**
- Mock 服务器使用端口 9999（非常规端口）
- 可以通过 `PORT=xxxx` 环境变量修改
- 只监听 localhost，不对外开放

⚠️ **启动开发服务器** - 占用 HOOK_PORT 端口（默认 3001）
```bash
npm run dev
```
**风险缓解：**
- 端口可配置
- 只监听 localhost

### 高风险操作（需要谨慎）

❌ **实际执行 Claude Code 命令** - 可能修改文件系统
```bash
npx clawnode exec "删除某个文件"
```

❌ **连接真实 OpenClaw 服务器** - 可能接收并执行真实任务
```bash
# 如果配置了真实的 OPENCLAW_URL 和 NODE_SECRET
npm start
```

---

## 三、环境隔离建议

### 1. 使用 .env.test 文件（推荐）

已创建 `.env.test` 文件，所有测试使用 Mock 配置：

```bash
# .env.test - 测试环境配置
NODE_ENV=test
LOG_LEVEL=error

# Mock 配置（不会连接真实服务）
OPENCLAW_URL=http://localhost:9999
NODE_ID=test-node
NODE_SECRET=test-secret
HOOK_PORT=9998
EXEC_TIMEOUT=5000
```

### 2. 不要修改生产配置

```bash
# 生产配置（如果需要连接真实服务）
# .env.production 或 .env
OPENCLAW_URL=https://real-openclaw-server.com
NODE_SECRET=real-secret-key
```

### 3. 使用 Mock 进行所有测试

所有单元测试都使用 Mock，不会：
- 连接外部网络
- 修改文件系统
- 执行真实的 Claude Code 命令

---

## 四、测试环境检查清单

在运行测试前，请确认：

### 必需条件
- [ ] Node.js >= 18.0.0 已安装
- [ ] npm 依赖已安装 (`npm install` 已运行)
- [ ] `node_modules` 目录存在

### 可选条件（用于特定测试）
- [ ] `.env.test` 文件存在（已创建）
- [ ] Mock 服务器脚本存在（已创建）

### 安全检查
- [ ] 没有配置真实的服务地址
- [ ] 没有配置真实的密钥
- [ ] 端口没有被其他重要服务占用

---

## 五、运行测试的安全保障

### 单元测试 - 100% 安全

```bash
npm test
```

**为什么安全：**
1. 所有外部调用都被 Mock（axios、express 等）
2. 不连接任何网络服务
3. 不执行任何文件系统写操作
4. 不执行真实的 Claude Code 命令

### 覆盖率测试 - 100% 安全

```bash
npm run test:coverage
```

**为什么安全：**
- 与单元测试相同，只是生成覆盖率报告
- 报告输出到 `coverage/` 目录

### 监听模式 - 100% 安全

```bash
npm run test:watch
```

**为什么安全：**
- 与单元测试相同，只是自动重新运行

---

## 六、如果本地环境被破坏的影响分析

### 最坏情况分析

| 场景 | 可能原因 | 影响范围 | 恢复方法 |
|------|----------|----------|----------|
| node_modules 损坏 | npm 安装失败 | 无法运行测试 | `rm -rf node_modules && npm install` |
| dist 目录错误 | 编译失败 | 无法运行生产代码 | `npm run build` 重新编译 |
| 配置文件错误 | 手动修改错误 | 测试失败 | 恢复 `.env.example` |
| 端口冲突 | 服务未正常关闭 | 无法启动服务 | 关闭占用端口的进程 |

### 不会影响的内容

- ❌ 不会影响系统文件
- ❌ 不会影响其他项目
- ❌ 不会泄露敏感信息（没有配置真实密钥）
- ❌ 不会破坏 Git 仓库

---

## 七、推荐的测试流程

### 1. 首次运行（最安全）

```bash
# 1. 确认环境
node --version
npm --version

# 2. 安装依赖（如果还没有）
npm install

# 3. 运行单元测试
npm test
```

### 2. 查看测试覆盖率

```bash
npm run test:coverage
# 报告在 coverage/index.html
```

### 3. 开发时的持续测试

```bash
npm run test:watch
```

### 4. 如果需要测试完整流程（可选）

```bash
# 终端 1: 启动 Mock 服务器
node test/mocks/openclaw-server.js

# 终端 2: 运行 E2E 测试
npm test -- e2e
```

---

## 八、环境验证脚本

创建 `test/verify-env.js` 来验证环境：

```bash
node test/verify-env.js
```

这个脚本会检查：
- Node.js 版本
- npm 版本
- 依赖是否安装
- 配置文件是否存在
- 端口是否可用

---

## 九、常见问题排查

### Q1: 测试失败是因为环境问题吗？

运行环境验证：
```bash
node test/verify-env.js
```

### Q2: 如何确认测试没有连接外部服务？

所有测试都使用 Mock，可以查看：
- `src/__tests__/setup.ts` - 测试环境配置
- 各个测试文件中的 `jest.mock()` 调用

### Q3: 如果误配置了真实服务怎么办？

1. 立即停止运行的服务（Ctrl+C）
2. 删除或重命名 `.env` 文件
3. 使用 `.env.test` 覆盖配置

### Q4: 端口被占用怎么办？

```bash
# Windows: 查找占用端口的进程
netstat -ano | findstr :3001

# 杀死进程（替换 PID）
taskkill /PID <PID> /F
```

---

## 十、总结

### 可以安全运行的命令

| 命令 | 风险等级 | 说明 |
|------|----------|------|
| `npm test` | ✅ 安全 | 单元测试，完全 Mock |
| `npm run test:watch` | ✅ 安全 | 监听模式 |
| `npm run test:coverage` | ✅ 安全 | 覆盖率测试 |
| `npm run build` | ✅ 安全 | 编译 TypeScript |
| `npx clawnode status` | ✅ 安全 | 只读 CLI 命令 |
| `npx clawnode config` | ✅ 安全 | 显示配置 |
| `npx clawnode --help` | ✅ 安全 | 显示帮助 |

### 需要谨慎的命令

| 命令 | 风险等级 | 说明 |
|------|----------|------|
| `npm run dev` | ⚠️ 中等 | 启动开发服务器 |
| `npm start` | ⚠️ 中等 | 启动生产服务 |
| `node test/mocks/openclaw-server.js` | ⚠️ 中等 | 启动 Mock 服务器 |
| `npx clawnode exec "..."` | ⚠️ 中等 | 执行 Claude Code 命令 |

### 禁止在测试环境运行

| 命令 | 风险等级 | 说明 |
|------|----------|------|
| 连接真实 OpenClaw 服务器的任何操作 | ❌ 高风险 | 可能执行未知任务 |

---

## 附录：环境验证脚本

```javascript
// test/verify-env.js
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('=== ClawNode 环境验证 ===\n')

// 检查 Node.js 版本
try {
  const nodeVersion = execSync('node --version').toString().trim()
  const major = parseInt(nodeVersion.slice(1))
  console.log(`✓ Node.js: ${nodeVersion}`)
  if (major < 18) {
    console.log('  ⚠️  警告：Node.js 版本低于 18.0.0')
  }
} catch (e) {
  console.log('✗ Node.js: 未安装')
}

// 检查 npm 版本
try {
  const npmVersion = execSync('npm --version').toString().trim()
  console.log(`✓ npm: ${npmVersion}`)
} catch (e) {
  console.log('✗ npm: 未安装')
}

// 检查依赖
const nodeModules = path.join(__dirname, '..', 'node_modules')
if (fs.existsSync(nodeModules)) {
  console.log('✓ node_modules: 已安装')
} else {
  console.log('✗ node_modules: 未安装')
  console.log('  运行：npm install')
}

// 检查配置文件
const envTest = path.join(__dirname, '..', '.env.test')
if (fs.existsSync(envTest)) {
  console.log('✓ .env.test: 存在')
} else {
  console.log('⚠️ .env.test: 不存在')
}

// 检查端口
const net = require('net')
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port)
  })
}

async function checkPorts() {
  const ports = [3001, 9999]
  for (const port of ports) {
    const available = await checkPort(port)
    if (available) {
      console.log(`✓ 端口 ${port}: 可用`)
    } else {
      console.log(`⚠️  端口 ${port}: 被占用`)
    }
  }
}

checkPorts()
console.log('\n=== 验证完成 ===')
```
