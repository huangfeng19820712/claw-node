/**
 * 手动测试脚本
 * 用于快速测试 ClawNode 功能
 */

const { execSync } = require('child_process')
const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log(`
=====================================
  ClawNode 手动测试工具
=====================================

请选择测试项:

  1. 运行单元测试
  2. 运行测试并生成覆盖率报告
  3. 启动 Mock OpenClaw 服务器
  4. 启动 ClawNode (开发模式)
  5. 运行 CLI 命令 - 状态
  6. 运行 CLI 命令 - 配置
  7. 运行 CLI 命令 - 执行测试

按 q 退出
`)

function runCommand(command, description) {
  console.log(`\n> ${description}`)
  console.log(`  执行：${command}\n`)

  try {
    execSync(command, { stdio: 'inherit', cwd: __dirname + '/..' })
  } catch (error) {
    console.error(`命令执行失败：${error.message}`)
  }
}

function startMockServer() {
  console.log('\n> 启动 Mock OpenClaw 服务器...\n')
  try {
    execSync('node test/mocks/openclaw-server.js', {
      stdio: 'inherit',
      cwd: __dirname + '/..'
    })
  } catch (error) {
    console.error(`启动失败：${error.message}`)
  }
}

function startDevMode() {
  console.log('\n> 启动 ClawNode 开发模式...\n')
  console.log('提示：按 Ctrl+C 停止服务\n')
  try {
    execSync('npm run dev', {
      stdio: 'inherit',
      cwd: __dirname + '/..'
    })
  } catch (error) {
    console.error(`启动失败：${error.message}`)
  }
}

function showMenu() {
  rl.question('\n请选择 [1-7/q]: ', (answer) => {
    switch (answer.trim()) {
      case '1':
        runCommand('npm test', '运行单元测试')
        showMenu()
        break
      case '2':
        runCommand('npm run test:coverage', '运行测试并生成覆盖率报告')
        showMenu()
        break
      case '3':
        startMockServer()
        showMenu()
        break
      case '4':
        startDevMode()
        showMenu()
        break
      case '5':
        runCommand('npx clawnode status', '查看节点状态')
        showMenu()
        break
      case '6':
        runCommand('npx clawnode config', '查看配置')
        showMenu()
        break
      case '7':
        runCommand('npx clawnode exec "hello"', '执行测试命令')
        showMenu()
        break
      case 'q':
        console.log('\n再见!')
        rl.close()
        break
      default:
        console.log('无效选择，请重新输入')
        showMenu()
    }
  })
}

showMenu()
