/**
 * CallbackClient 回调测试
 * 测试各种回调场景
 */

const axios = require('axios')

const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:9998'
const NODE_ID = 'test-node'

class CallbackTester {
  constructor() {
    this.client = axios.create({
      baseURL: CALLBACK_URL,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // 重置回调服务器
  async reset() {
    console.log('\n>>> 重置回调服务器...')
    const res = await this.client.post('/api/reset')
    console.log(`<<< ${JSON.stringify(res.data)}`)
    return res.data
  }

  // 发送开始回调
  async sendStart(taskId) {
    console.log(`\n>>> 发送开始回调：${taskId}`)
    const res = await this.client.post('/api/callbacks', {
      taskId,
      event: 'start',
      data: {
        nodeId: NODE_ID,
        startedAt: new Date().toISOString()
      }
    })
    console.log(`<<< 回调索引：${res.data.index}`)
    return res.data
  }

  // 发送输出回调
  async sendOutput(taskId, output) {
    console.log(`\n>>> 发送输出回调：${taskId}`)
    const res = await this.client.post('/api/callbacks', {
      taskId,
      event: 'output',
      data: { output }
    })
    console.log(`<<< 回调索引：${res.data.index}`)
    return res.data
  }

  // 发送完成回调
  async sendComplete(taskId, result) {
    console.log(`\n>>> 发送完成回调：${taskId}`)
    const res = await this.client.post('/api/callbacks', {
      taskId,
      event: 'complete',
      data: result
    })
    console.log(`<<< 回调索引：${res.data.index}`)
    return res.data
  }

  // 发送错误回调
  async sendError(taskId, error) {
    console.log(`\n>>> 发送错误回调：${taskId}`)
    const res = await this.client.post('/api/callbacks', {
      taskId,
      event: 'error',
      data: { error }
    })
    console.log(`<<< 回调索引：${res.data.index}`)
    return res.data
  }

  // 获取所有回调
  async getCallbacks() {
    console.log('\n>>> 获取所有回调...')
    const res = await this.client.get('/api/callbacks')
    console.log(`<<< 回调数量：${res.data.count}`)
    return res.data
  }

  // 获取统计信息
  async getStats() {
    console.log('\n>>> 获取统计信息...')
    const res = await this.client.get('/api/stats')
    console.log(`<<< ${JSON.stringify(res.data, null, 2)}`)
    return res.data
  }

  // 获取特定任务的回调
  async getTaskCallbacks(taskId) {
    console.log(`\n>>> 获取任务 ${taskId} 的回调...`)
    const res = await this.client.get(`/api/callbacks/${taskId}`)
    console.log(`<<< 回调数量：${res.data.count}`)
    return res.data
  }
}

// 运行测试
async function runTests() {
  const tester = new CallbackTester()

  console.log('========================================')
  console.log('  ClawNode 回调功能测试')
  console.log('========================================')

  // 检查服务器是否运行
  try {
    await tester.client.get('/health')
    console.log('\n✓ 回调服务器运行正常')
  } catch (e) {
    console.error('\n✗ 回调服务器未运行')
    console.error('请先运行：node test/mocks/callback-server.js')
    process.exit(1)
  }

  // 重置数据
  await tester.reset()

  // 测试 1: 成功任务流程
  console.log('\n========================================')
  console.log('  测试 1: 成功任务流程')
  console.log('========================================')

  const taskId1 = 'test-task-success-' + Date.now()
  await tester.sendStart(taskId1)
  await tester.sendOutput(taskId1, '处理中...\n')
  await tester.sendOutput(taskId1, '步骤 1 完成\n')
  await tester.sendOutput(taskId1, '步骤 2 完成\n')
  await tester.sendComplete(taskId1, {
    status: 'SUCCESS',
    output: '最终结果',
    exitCode: 0,
    completedAt: new Date().toISOString()
  })

  // 测试 2: 失败任务流程
  console.log('\n========================================')
  console.log('  测试 2: 失败任务流程')
  console.log('========================================')

  const taskId2 = 'test-task-error-' + Date.now()
  await tester.sendStart(taskId2)
  await tester.sendOutput(taskId2, '处理中...\n')
  await tester.sendError(taskId2, '执行超时')

  // 测试 3: 多任务并发
  console.log('\n========================================')
  console.log('  测试 3: 多任务并发')
  console.log('========================================')

  const tasks = []
  for (let i = 0; i < 3; i++) {
    const taskId = `test-task-concurrent-${i}-${Date.now()}`
    tasks.push(taskId)
    await tester.sendStart(taskId)
  }

  for (let i = 0; i < tasks.length; i++) {
    await tester.sendOutput(tasks[i], `任务 ${i} 输出\n`)
    await tester.sendComplete(tasks[i], {
      status: 'SUCCESS',
      output: `任务 ${i} 完成`,
      exitCode: 0,
      completedAt: new Date().toISOString()
    })
  }

  // 查看统计
  console.log('\n========================================')
  console.log('  统计信息')
  console.log('========================================')
  await tester.getStats()

  // 查看所有回调
  console.log('\n========================================')
  console.log('  所有回调')
  console.log('========================================')
  await tester.getCallbacks()

  console.log('\n========================================')
  console.log('  测试完成!')
  console.log('========================================\n')
}

// 运行测试
runTests().catch(err => {
  console.error('测试失败:', err.message)
  process.exit(1)
})
