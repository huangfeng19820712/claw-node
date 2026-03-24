/**
 * 环境验证脚本
 * 用于检查测试环境是否满足要求
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const net = require('net')

console.log('========================================')
console.log('  ClawNode 环境验证')
console.log('========================================\n')

let hasError = false

// 检查 Node.js 版本
console.log('1. 检查 Node.js 版本')
try {
  const nodeVersion = execSync('node --version').toString().trim()
  const major = parseInt(nodeVersion.slice(1))
  console.log(`   ✓ Node.js: ${nodeVersion}`)
  if (major < 18) {
    console.log('   ⚠️  警告：Node.js 版本低于 18.0.0，可能不兼容')
  }
} catch (e) {
  console.log('   ✗ Node.js: 未安装或不在 PATH 中')
  hasError = true
}

// 检查 npm 版本
console.log('\n2. 检查 npm 版本')
try {
  const npmVersion = execSync('npm --version').toString().trim()
  console.log(`   ✓ npm: ${npmVersion}`)
} catch (e) {
  console.log('   ✗ npm: 未安装或不在 PATH 中')
  hasError = true
}

// 检查依赖是否安装
console.log('\n3. 检查依赖安装')
const nodeModules = path.join(__dirname, '..', 'node_modules')
const packageJson = path.join(__dirname, '..', 'package.json')

if (fs.existsSync(packageJson)) {
  console.log('   ✓ package.json: 存在')
} else {
  console.log('   ✗ package.json: 不存在')
  hasError = true
}

if (fs.existsSync(nodeModules)) {
  console.log('   ✓ node_modules: 已安装')

  // 检查关键依赖
  const requiredDeps = ['jest', 'typescript', 'ts-node', 'axios', 'express']
  const missing = []
  for (const dep of requiredDeps) {
    if (!fs.existsSync(path.join(nodeModules, dep))) {
      missing.push(dep)
    }
  }

  if (missing.length > 0) {
    console.log(`   ⚠️  缺少依赖：${missing.join(', ')}`)
    console.log('   运行：npm install')
  } else {
    console.log('   ✓ 关键依赖：已安装')
  }
} else {
  console.log('   ✗ node_modules: 未安装')
  console.log('   运行：npm install')
  hasError = true
}

// 检查配置文件
console.log('\n4. 检查配置文件')
const files = [
  { path: '.env.test', required: false, desc: '测试环境配置' },
  { path: '.env.example', required: true, desc: '配置示例' },
  { path: 'jest.config.js', required: true, desc: 'Jest 配置' },
  { path: 'tsconfig.json', required: true, desc: 'TypeScript 配置' }
]

for (const file of files) {
  const filePath = path.join(__dirname, '..', file.path)
  if (fs.existsSync(filePath)) {
    console.log(`   ✓ ${file.path}: ${file.desc}`)
  } else {
    if (file.required) {
      console.log(`   ✗ ${file.path}: ${file.desc} (必需)`)
      hasError = true
    } else {
      console.log(`   ⚠️  ${file.path}: ${file.desc} (可选)`)
    }
  }
}

// 检查测试目录
console.log('\n5. 检查测试目录')
const testDirs = [
  'src/__tests__',
  'src/__tests__/modules',
  'src/__tests__/integration',
  'src/__tests__/e2e',
  'test/mocks'
]

for (const dir of testDirs) {
  const dirPath = path.join(__dirname, '..', dir)
  if (fs.existsSync(dirPath)) {
    console.log(`   ✓ ${dir}`)
  } else {
    console.log(`   ⚠️  ${dir}: 不存在`)
  }
}

// 检查端口可用性
console.log('\n6. 检查端口可用性')
const ports = [
  { port: 3001, name: 'Hook 服务 (默认)' },
  { port: 9999, name: 'Mock OpenClaw (测试)' }
]

async function checkPorts() {
  for (const { port, name } of ports) {
    const available = await new Promise((resolve) => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close()
        resolve(true)
      })
      server.listen(port)
    })

    if (available) {
      console.log(`   ✓ 端口 ${port} (${name}): 可用`)
    } else {
      console.log(`   ⚠️  端口 ${port} (${name}): 被占用`)
    }
  }

  // 总结
  console.log('\n========================================')
  if (hasError) {
    console.log('验证结果：❌ 发现问题，请修复后重试')
  } else {
    console.log('验证结果：✅ 环境配置正确，可以运行测试')
  }
  console.log('========================================')

  // 显示快速命令
  console.log('\n快速开始:')
  console.log('  npm test                  - 运行所有测试')
  console.log('  npm run test:coverage     - 生成覆盖率报告')
  console.log('  npm run test:watch        - 监听模式')
  console.log('  node test/verify-env.js   - 重新验证环境')
}

checkPorts()
