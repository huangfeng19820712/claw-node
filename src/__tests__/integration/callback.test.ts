/**
 * 回调功能集成测试
 * 测试 CallbackClient 发送回调的完整性
 */

import axios from 'axios'
import { CallbackClient } from '../../modules/callback-client'

jest.mock('axios')

const mockedAxios = axios as jest.Mocked<typeof axios>

describe('CallbackClient 集成测试', () => {
  let callbackClient: CallbackClient
  let mockPost: jest.Mock

  const baseUrl = 'http://localhost:9998'
  const nodeId = 'test-node'

  beforeEach(() => {
    jest.clearAllMocks()

    mockPost = jest.fn().mockResolvedValue({})
    const mockAxiosInstance = {
      post: mockPost
    }
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any)

    callbackClient = new CallbackClient(baseUrl, nodeId)
  })

  describe('回调流程测试', () => {
    it('应该完成完整的成功任务回调流程', async () => {
      const taskId = 'test-task-123'

      // 1. 发送开始回调
      await callbackClient.onStart(taskId, {
        nodeId: 'test-node',
        startedAt: new Date().toISOString()
      })

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'start'
        })
      )

      // 2. 发送输出回调
      mockPost.mockClear()
      await callbackClient.onOutput(taskId, '处理中...\n')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'output',
          data: { output: '处理中...\n' }
        })
      )

      // 3. 发送完成回调
      mockPost.mockClear()
      await callbackClient.onComplete(taskId, {
        status: 'SUCCESS',
        output: '最终结果',
        exitCode: 0
      })

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'complete',
          data: expect.objectContaining({
            status: 'SUCCESS',
            exitCode: 0
          })
        })
      )
    })

    it('应该完成失败任务的回调流程', async () => {
      const taskId = 'test-task-error-456'

      // 1. 发送开始回调
      await callbackClient.onStart(taskId)

      // 2. 发送部分输出
      await callbackClient.onOutput(taskId, '错误前的输出\n')

      // 3. 发送错误回调
      mockPost.mockClear()
      await callbackClient.onError(taskId, '执行超时')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'error',
          data: { error: '执行超时' }
        })
      )
    })

    it('应该支持多次输出回调', async () => {
      const taskId = 'test-task-multi-output'
      const outputs = [
        '第 1 行输出\n',
        '第 2 行输出\n',
        '第 3 行输出\n'
      ]

      for (const output of outputs) {
        await callbackClient.onOutput(taskId, output)
      }

      expect(mockPost).toHaveBeenCalledTimes(3)
      expect(mockPost).toHaveBeenNthCalledWith(
        1,
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'output',
          data: { output: outputs[0] }
        })
      )
      expect(mockPost).toHaveBeenNthCalledWith(
        2,
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'output',
          data: { output: outputs[1] }
        })
      )
      expect(mockPost).toHaveBeenNthCalledWith(
        3,
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'output',
          data: { output: outputs[2] }
        })
      )
    })
  })

  describe('回调数据结构测试', () => {
    it('开始回调应包含节点信息', async () => {
      const taskId = 'test-task-node-info'
      const startTime = new Date().toISOString()

      await callbackClient.onStart(taskId, {
        nodeId: 'test-node',
        startedAt: startTime
      })

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'start',
          data: {
            nodeId: 'test-node',
            startedAt: startTime
          },
          nodeId: 'test-node'
        })
      )
    })

    it('完成回调应包含执行结果', async () => {
      const taskId = 'test-task-result'

      await callbackClient.onComplete(taskId, {
        status: 'SUCCESS',
        output: '执行结果',
        error: undefined,
        exitCode: 0,
        completedAt: new Date().toISOString()
      })

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'complete',
          data: expect.objectContaining({
            status: 'SUCCESS',
            output: '执行结果',
            exitCode: 0
          })
        })
      )
    })

    it('错误回调应包含错误信息', async () => {
      const taskId = 'test-task-error-detail'

      await callbackClient.onError(taskId, '详细错误信息')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId,
          event: 'error',
          data: { error: '详细错误信息' }
        })
      )
    })
  })

  describe('错误处理测试', () => {
    it('回调失败时不应抛出异常', async () => {
      mockPost.mockRejectedValue(new Error('Network error'))

      await expect(callbackClient.onStart('task-123')).resolves.not.toThrow()
      await expect(callbackClient.onOutput('task-123', 'test')).resolves.not.toThrow()
      await expect(callbackClient.onComplete('task-123', {})).resolves.not.toThrow()
      await expect(callbackClient.onError('task-123', 'error')).resolves.not.toThrow()
    })

    it('回调失败时应记录日志', async () => {
      mockPost.mockRejectedValue(new Error('Connection refused'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await callbackClient.onStart('task-123')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send callback')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('并发回调测试', () => {
    it('应该能处理并发回调', async () => {
      const taskIds = ['task-1', 'task-2', 'task-3']
      const promises = taskIds.map(id =>
        callbackClient.onStart(id)
      )

      await Promise.all(promises)

      expect(mockPost).toHaveBeenCalledTimes(3)
    })

    it('并发回调应该保持数据独立', async () => {
      const tasks = [
        { id: 'task-a', data: { result: 'A' } },
        { id: 'task-b', data: { result: 'B' } }
      ]

      await Promise.all(
        tasks.map(t => callbackClient.onComplete(t.id, t.data))
      )

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId: 'task-a',
          event: 'complete',
          data: expect.objectContaining({ result: 'A' })
        })
      )
      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId: 'task-b',
          event: 'complete',
          data: expect.objectContaining({ result: 'B' })
        })
      )
    })
  })
})
