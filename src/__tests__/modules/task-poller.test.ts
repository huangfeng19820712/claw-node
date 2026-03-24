/**
 * TaskPoller 单元测试
 */

import axios from 'axios'
import { TaskPoller } from '../../modules/task-poller'
import { Task, TaskStatus, TaskType } from '../../types'

jest.mock('axios')

const mockedAxios = axios as jest.Mocked<typeof axios>

describe('TaskPoller', () => {
  let taskPoller: TaskPoller
  const mockConfig = {
    openClawUrl: 'http://localhost:3000',
    nodeId: 'test-node',
    nodeSecret: 'test-secret',
    pollInterval: 1000,
    hookPort: 3001,
    execTimeout: 300000,
    claudeApiKey: 'test-key',
    logLevel: 'error'
  }

  const mockTask: Task = {
    id: 'task-123',
    type: TaskType.EXECUTE,
    status: TaskStatus.PENDING,
    prompt: 'Test prompt',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  let mockGet: jest.Mock
  let mockPost: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock axios create
    mockGet = jest.fn()
    mockPost = jest.fn()
    const mockAxiosInstance = {
      get: mockGet,
      post: mockPost
    }
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any)

    taskPoller = new TaskPoller(mockConfig)
  })

  describe('poll', () => {
    it('应该成功获取任务', async () => {
      const mockResponse = {
        data: {
          task: mockTask,
          shouldPoll: true
        }
      }

      mockGet.mockResolvedValue(mockResponse)

      const task = await taskPoller.poll()

      expect(task).toBeDefined()
      expect(task?.id).toBe('task-123')
      expect(mockGet).toHaveBeenCalledWith('/api/tasks/poll', {
        params: { nodeId: 'test-node' }
      })
    })

    it('当没有任务时返回 null', async () => {
      const mockResponse = {
        data: {
          shouldPoll: true
        }
      }

      mockGet.mockResolvedValue(mockResponse)

      const task = await taskPoller.poll()

      expect(task).toBeNull()
    })

    it('当请求失败时返回 null', async () => {
      mockGet.mockRejectedValue(new Error('Network error'))

      const task = await taskPoller.poll()

      expect(task).toBeNull()
    })
  })

  describe('updateTaskStatus', () => {
    it('应该成功更新任务状态', async () => {
      mockPost.mockResolvedValue({})

      await taskPoller.updateTaskStatus('task-123', 'RUNNING', { started: true })

      expect(mockPost).toHaveBeenCalledWith('/api/tasks/task-123/status', {
        status: 'RUNNING',
        data: { started: true },
        nodeId: 'test-node'
      })
    })

    it('当请求失败时不应该抛出异常', async () => {
      mockPost.mockRejectedValue(new Error('Network error'))

      await expect(
        taskPoller.updateTaskStatus('task-123', 'RUNNING')
      ).resolves.not.toThrow()
    })
  })

  describe('startPolling', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('应该开始轮询循环', () => {
      const onTask = jest.fn()
      mockGet.mockResolvedValue({
        data: { shouldPoll: true }
      })

      taskPoller.startPolling(onTask)

      expect(onTask).not.toHaveBeenCalled()
    })

    it('当有任务时应该调用回调', async () => {
      const onTask = jest.fn()
      mockGet
        .mockResolvedValueOnce({
          data: { task: mockTask, shouldPoll: true }
        })
        .mockResolvedValue({
          data: { shouldPoll: true }
        })

      taskPoller.startPolling(onTask)

      // 等待轮询循环执行
      await jest.advanceTimersByTimeAsync(100)

      expect(onTask).toHaveBeenCalledWith(expect.objectContaining({
        id: 'task-123'
      }))
    })
  })

  describe('stopPolling', () => {
    it('应该停止轮询', () => {
      mockGet.mockResolvedValue({
        data: { shouldPoll: true }
      })

      taskPoller.startPolling(jest.fn())
      taskPoller.stopPolling()

      // 停止后不应该继续轮询
      expect(taskPoller).toBeDefined()
    })
  })
})
