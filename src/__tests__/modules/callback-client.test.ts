/**
 * CallbackClient 单元测试
 */

import axios from 'axios'
import { CallbackClient } from '../../modules/callback-client'

jest.mock('axios')

const mockedAxios = axios as jest.Mocked<typeof axios>

describe('CallbackClient', () => {
  let callbackClient: CallbackClient
  const baseUrl = 'http://localhost:3000'
  const nodeId = 'test-node'

  let mockPost: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock axios create
    mockPost = jest.fn().mockResolvedValue({})
    const mockAxiosInstance = {
      post: mockPost
    }
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any)

    callbackClient = new CallbackClient(baseUrl, nodeId)
  })

  describe('onStart', () => {
    it('应该发送任务开始回调', async () => {
      await callbackClient.onStart('task-123', { startedAt: '2024-01-01' })

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId: 'task-123',
          event: 'start',
          data: { startedAt: '2024-01-01' }
        })
      )
    })
  })

  describe('onOutput', () => {
    it('应该发送输出回调', async () => {
      await callbackClient.onOutput('task-123', 'Test output')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId: 'task-123',
          event: 'output',
          data: { output: 'Test output' }
        })
      )
    })
  })

  describe('onComplete', () => {
    it('应该发送完成回调', async () => {
      await callbackClient.onComplete('task-123', { exitCode: 0 })

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId: 'task-123',
          event: 'complete',
          data: { exitCode: 0 }
        })
      )
    })
  })

  describe('onError', () => {
    it('应该发送错误回调', async () => {
      await callbackClient.onError('task-123', 'Test error')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/callbacks',
        expect.objectContaining({
          taskId: 'task-123',
          event: 'error',
          data: { error: 'Test error' }
        })
      )
    })
  })

  describe('sendHook', () => {
    it('应该发送 hook 回调到指定 URL', async () => {
      mockedAxios.post.mockResolvedValueOnce({})

      await callbackClient.sendHook('http://example.com/hook', { data: 'test' })

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://example.com/hook',
        { data: 'test' },
        { headers: { 'Content-Type': 'application/json' } }
      )
    })

    it('当请求失败时不应该抛出异常', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'))

      await expect(
        callbackClient.sendHook('http://example.com/hook', {})
      ).resolves.not.toThrow()
    })
  })

  describe('错误处理', () => {
    it('当回调失败时应该记录错误但不抛出', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'))

      await expect(callbackClient.onStart('task-123')).resolves.not.toThrow()
    })
  })
})
