/**
 * 回调测试 Mock 服务器
 * 用于接收和验证 ClawNode 发送的回调
 */

const express = require('express')
const app = express()
const PORT = process.env.PORT || 9998

app.use(express.json())

// 存储所有回调
const callbacks = []

// 事件计数器
const eventCounts = {
  start: 0,
  output: 0,
  complete: 0,
  error: 0
}

// 回调接收接口
app.post('/api/callbacks', (req, res) => {
  const { taskId, event, data, nodeId } = req.body

  const callback = {
    taskId,
    event,
    data,
    nodeId,
    receivedAt: new Date().toISOString(),
    index: callbacks.length
  }

  callbacks.push(callback)

  // 计数
  if (eventCounts[event] !== undefined) {
    eventCounts[event]++
  }

  console.log(`\n[${new Date().toISOString()}] 回调 #${callback.index}`)
  console.log(`  事件：${event}`)
  console.log(`  任务：${taskId}`)
  console.log(`  节点：${nodeId}`)
  console.log(`  数据：${JSON.stringify(data, null, 2)}`)

  res.json({ success: true, index: callback.index })
})

// 查看所有回调
app.get('/api/callbacks', (req, res) => {
  res.json({
    callbacks,
    count: callbacks.length,
    eventCounts
  })
})

// 查看特定任务的回调
app.get('/api/callbacks/:taskId', (req, res) => {
  const { taskId } = req.params
  const taskCallbacks = callbacks.filter(cb => cb.taskId === taskId)
  res.json({
    taskId,
    callbacks: taskCallbacks,
    count: taskCallbacks.length
  })
})

// 查看回调统计
app.get('/api/stats', (req, res) => {
  res.json({
    totalCallbacks: callbacks.length,
    eventCounts,
    lastCallback: callbacks[callbacks.length - 1] || null
  })
})

// 重置所有数据
app.post('/api/reset', (req, res) => {
  callbacks.length = 0
  eventCounts.start = 0
  eventCounts.output = 0
  eventCounts.complete = 0
  eventCounts.error = 0
  console.log('\n[回调数据已重置]\n')
  res.json({ success: true, message: 'Callbacks reset' })
})

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    callbacksReceived: callbacks.length
  })
})

app.listen(PORT, () => {
  console.log('========================================')
  console.log('  ClawNode 回调测试服务器')
  console.log('========================================')
  console.log(`运行在：http://localhost:${PORT}`)
  console.log('')
  console.log('API 端点:')
  console.log(`  POST /api/callbacks     - 接收回调`)
  console.log(`  GET  /api/callbacks     - 查看所有回调`)
  console.log(`  GET  /api/callbacks/:id - 查看特定任务回调`)
  console.log(`  GET  /api/stats         - 查看统计信息`)
  console.log(`  POST /api/reset         - 重置数据`)
  console.log(`  GET  /health            - 健康检查`)
  console.log('========================================')
  console.log('')
  console.log('等待 ClawNode 发送回调...')
})
