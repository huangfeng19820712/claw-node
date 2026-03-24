/**
 * Mock OpenClaw Server
 * 用于 E2E 测试
 */

const express = require('express')
const app = express()
const PORT = process.env.PORT || 9999

app.use(express.json())

const tasks = new Map()
const callbacks = []

app.get('/api/tasks/poll', (req, res) => {
  const nodeId = req.query.nodeId
  console.log('[%s] Poll request from node: %s', new Date().toISOString(), nodeId)

  const task = {
    id: 'mock-task-' + Date.now(),
    type: 'EXECUTE',
    status: 'PENDING',
    prompt: '这是一个模拟任务',
    callbackUrl: 'http://localhost:9999/api/callbacks',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  res.json({
    task: task,
    shouldPoll: true,
    interval: 5000
  })
})

app.post('/api/tasks/:taskId/status', (req, res) => {
  const taskId = req.params.taskId
  const { status, data, nodeId } = req.body
  console.log('[%s] Task %s status updated to %s by node %s', new Date().toISOString(), taskId, status, nodeId)
  tasks.set(taskId, { status, data, nodeId, updatedAt: new Date().toISOString() })
  res.json({ success: true })
})

app.post('/api/callbacks', (req, res) => {
  const { taskId, event, data } = req.body
  console.log('[%s] Callback received: %s for task %s', new Date().toISOString(), event, taskId)
  callbacks.push({ taskId, event, data, receivedAt: new Date().toISOString() })
  res.json({ success: true })
})

app.get('/api/callbacks', (req, res) => {
  res.json({ callbacks, count: callbacks.length })
})

app.get('/api/tasks/:taskId', (req, res) => {
  const task = tasks.get(req.params.taskId)
  if (task) {
    res.json({ success: true, task })
  } else {
    res.status(404).json({ success: false, error: 'Task not found' })
  }
})

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    tasksCount: tasks.size,
    callbacksCount: callbacks.length
  })
})

app.post('/api/reset', (req, res) => {
  tasks.clear()
  callbacks.length = 0
  console.log('[%s] Mock data reset', new Date().toISOString())
  res.json({ success: true, message: 'Mock data reset' })
})

app.listen(PORT, () => {
  console.log('========================================')
  console.log('Mock OpenClaw Server')
  console.log('Running on: http://localhost:' + PORT)
  console.log('========================================')
})
