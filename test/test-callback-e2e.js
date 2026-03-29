/**
 * 回调 E2E 测试
 * 需要回调服务器运行才能执行
 *
 * 使用方法:
 * 1. 启动回调服务器：node test/mocks/callback-server.js
 * 2. 运行测试：node test/test-callback-e2e.js
 */

const axios = require('axios')
const { CallbackClient } = require('../dist/modules/callback-client')

const CALLBACK_SERVER_URL = process.env.CALLBACK_SERVER_URL || 'http://localhost:9998'

class CallbackE2ETester {
  constructor() {
    this.callbackClient = new CallbackClient(CALLBACK_SERVER_URL, 'e2e-test-node')
    this.httpClient = axios.create({
      baseURL: CALLBACK_SERVER_URL
    })
  }

  // 检查服务器是否运行
  async checkServer() {
    try {
      const res = await this.httpClient.get('/health')
      console.log('✓ 回调服务器运行正常')
      return true
    } catch (e) {
      console.error('✗ 回调服务器未运行')
      console.error('请先运行：node test/mocks/callback-server.js')
      return false
    }
  }

  // 重置服务器数据
  async reset() {
    console.log('重置服务器数据...')
    await this.httpClient.post('/api/reset')
  }

  // 获取统计信息
  async getStats() {
    const res = await this.httpClient.get('/api/stats')
    return res.data
  }

  // 获取所有回调
  async getCallbacks() {
    const res = await this.httpClient.get('/api/callbacks')
    return res.data
  }

  // 获取特定任务的回调
  async getTaskCallbacks(taskId) {
    const res = await this.httpClient.get(`/api/callbacks/${taskId}`)
    return res.data
  }

  // 验证回调序列
  validateCallbackSequence(callbacks, expectedEvents) {
    const actualEvents = callbacks.map(cb => cb.event)
    const expected = expectedEvents
    const actual = actualEvents

    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error(
        `回调序列不匹配\n期望：${expected.join(' -> ')}\n实际：${actual.join(' -> ')}`
      )
    }
    console.log(`✓ 回调序列正确：${actual.join(' -> ')}`)
  }

  // 测试 1: 成功任务
  async testSuccessTask() {
    console.log('\n' + '='.repeat(50))
    console.log('测试 1: 成功任务回调')
    console.log('='.repeat(50))

    const taskId = `e2e-success-${Date.now()}`
    console.log(`任务 ID: ${taskId}`)

    // 发送回调序列
    console.log('发送开始回调...')
    await this.callbackClient.onStart(taskId, {
      nodeId: 'e2e-test-node',
      startedAt: new Date().toISOString()
    })

    console.log('发送输出回调 (1)...')
    await this.callbackClient.onOutput(taskId, '初始化环境...\n')

    console.log('发送输出回调 (2)...')
    await this.callbackClient.onOutput(taskId, '执行任务中...\n')

    console.log('发送输出回调 (3)...')
    await this.callbackClient.onOutput(taskId, '任务完成!\n')

    console.log('发送完成回调...')
    await this.callbackClient.onComplete(taskId, {
      status: 'SUCCESS',
      output: '任务执行成功',
      exitCode: 0,
      completedAt: new Date().toISOString()
    })

    // 验证
    const result = await this.getTaskCallbacks(taskId)
    this.validateCallbackSequence(result.callbacks, [
      'start',
      'output',
      'output',
      'output',
      'complete'
    ])

    console.log(`✓ 成功任务测试通过，共 ${result.count} 个回调`)
    return true
  }

  // 测试 2: 失败任务
  async testFailedTask() {
    console.log('\n' + '='.repeat(50))
    console.log('测试 2: 失败任务回调')
    console.log('='.repeat(50))

    const taskId = `e2e-failed-${Date.now()}`
    console.log(`任务 ID: ${taskId}`)

    console.log('发送开始回调...')
    await this.callbackClient.onStart(taskId, {
      nodeId: 'e2e-test-node',
      startedAt: new Date().toISOString()
    })

    console.log('发送输出回调...')
    await this.callbackClient.onOutput(taskId, '执行中...\n')

    console.log('发送错误回调...')
    await this.callbackClient.onError(taskId, '执行超时：超过 300 秒')

    // 验证
    const result = await this.getTaskCallbacks(taskId)
    this.validateCallbackSequence(result.callbacks, [
      'start',
      'output',
      'error'
    ])

    console.log(`✓ 失败任务测试通过，共 ${result.count} 个回调`)

    // 验证错误数据
    const errorCallback = result.callbacks.find(cb => cb.event === 'error')
    if (errorCallback && errorCallback.data.error.includes('超时')) {
      console.log('✓ 错误信息正确传递')
    }

    return true
  }

  // 测试 3: 并发任务
  async testConcurrentTasks() {
    console.log('\n' + '='.repeat(50))
    console.log('测试 3: 并发任务回调')
    console.log('='.repeat(50))

    const taskCount = 3
    const taskIds = Array.from({ length: taskCount }, (_, i) => `e2e-concurrent-${i}-${Date.now()}`)

    console.log(`创建 ${taskCount} 个并发任务...`)

    // 并发执行
    const promises = taskIds.map(async (taskId, index) => {
      await this.callbackClient.onStart(taskId, { index })
      await this.callbackClient.onOutput(taskId, `任务 ${index} 输出\n`)
      await this.callbackClient.onComplete(taskId, {
        status: 'SUCCESS',
        output: `任务 ${index} 完成`,
        exitCode: 0
      })
    })

    await Promise.all(promises)
    console.log('✓ 所有并发任务完成')

    // 验证每个任务的回调
    for (const taskId of taskIds) {
      const result = await this.getTaskCallbacks(taskId)
      this.validateCallbackSequence(result.callbacks, [
        'start',
        'output',
        'complete'
      ])
    }

    console.log(`✓ 并发任务测试通过，${taskCount} 个任务的回调都正确`)
    return true
  }

  // 测试 4: 大量输出
  async testBulkOutput() {
    console.log('\n' + '='.repeat(50))
    console.log('测试 4: 大量输出回调')
    console.log('='.repeat(50))

    const taskId = `e2e-bulk-output-${Date.now()}`
    const outputCount = 10

    console.log(`发送 ${outputCount} 条输出回调...`)

    await this.callbackClient.onStart(taskId)

    for (let i = 0; i < outputCount; i++) {
      await this.callbackClient.onOutput(taskId, `输出行 ${i + 1}/${outputCount}\n`)
    }

    await this.callbackClient.onComplete(taskId, {
      status: 'SUCCESS',
      output: '批量输出完成',
      exitCode: 0
    })

    // 验证
    const result = await this.getTaskCallbacks(taskId)
    const outputCallbacks = result.callbacks.filter(cb => cb.event === 'output')

    if (outputCallbacks.length === outputCount) {
      console.log(`✓ 大量输出测试通过，共 ${outputCallbacks.length} 条输出回调`)
    } else {
      throw new Error(`输出回调数量不匹配：期望 ${outputCount}，实际 ${outputCallbacks.length}`)
    }

    return true
  }

  // 运行所有测试
  async runAllTests() {
    console.log('\n')
    console.log('╔════════════════════════════════════════════════╗')
    console.log('║   ClawNode 回调 E2E 测试                        ║')
    console.log('╚════════════════════════════════════════════════╝')
    console.log(`\n回调服务器：${CALLBACK_SERVER_URL}`)

    if (!await this.checkServer()) {
      return false
    }

    await this.reset()

    const tests = [
      { name: '成功任务', fn: () => this.testSuccessTask() },
      { name: '失败任务', fn: () => this.testFailedTask() },
      { name: '并发任务', fn: () => this.testConcurrentTasks() },
      { name: '大量输出', fn: () => this.testBulkOutput() }
    ]

    const results = []

    for (const test of tests) {
      try {
        const passed = await test.fn()
        results.push({ name: test.name, passed })
      } catch (e) {
        console.error(`✗ ${test.name} 测试失败：${e.message}`)
        results.push({ name: test.name, passed: false, error: e.message })
      }
    }

    // 汇总结果
    console.log('\n' + '='.repeat(50))
    console.log('测试结果汇总')
    console.log('='.repeat(50))

    const passed = results.filter(r => r.passed).length
    const total = results.length

    for (const result of results) {
      const icon = result.passed ? '✓' : '✗'
      console.log(`${icon} ${result.name}: ${result.passed ? '通过' : '失败'}`)
      if (result.error) {
        console.log(`  错误：${result.error}`)
      }
    }

    console.log(`\n总计：${passed}/${total} 通过`)

    if (passed === total) {
      console.log('\n✓ 所有测试通过!')
      return true
    } else {
      console.log('\n✗ 部分测试失败')
      return false
    }
  }
}

// 运行测试
const tester = new CallbackE2ETester()
tester.runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试执行失败:', err.message)
    process.exit(1)
  })
