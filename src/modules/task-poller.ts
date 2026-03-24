import axios, { AxiosInstance } from 'axios'
import { Task, PollResponse, NodeConfig } from '../types'
import { logger } from '../utils/logger'

/**
 * Task Poller - 任务轮询器
 * 负责从 OpenClaw 服务器拉取任务
 */
export class TaskPoller {
  private client: AxiosInstance
  private config: NodeConfig
  private isPolling: boolean = false
  private pollTimeout: NodeJS.Timeout | null = null

  constructor(config: NodeConfig) {
    this.config = config
    this.client = axios.create({
      baseURL: config.openClawUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-Node-Id': config.nodeId,
        'X-Node-Secret': config.nodeSecret
      }
    })
  }

  /**
   * 轮询任务
   */
  async poll(): Promise<Task | null> {
    try {
      logger.debug('Polling for new tasks...')

      const response = await this.client.get<PollResponse>('/api/tasks/poll', {
        params: {
          nodeId: this.config.nodeId
        }
      })

      const { task, shouldPoll, interval } = response.data

      if (task) {
        logger.info(`Received new task: ${task.id}`, null, task.id)
        return task
      }

      if (!shouldPoll) {
        logger.debug('Server indicated to stop polling')
        return null
      }

      return null
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Poll failed: ${error.message}`)
      } else {
        logger.error(`Poll failed: ${error}`)
      }
      return null
    }
  }

  /**
   * 开始持续轮询
   */
  startPolling(onTask: (task: Task) => void | Promise<void>): void {
    if (this.isPolling) {
      logger.warn('Already polling')
      return
    }

    this.isPolling = true
    logger.info('Started polling for tasks')

    const pollLoop = async () => {
      if (!this.isPolling) return

      try {
        const task = await this.poll()
        if (task) {
          await onTask(task)
        }
      } catch (error) {
        logger.error(`Error in poll loop: ${error}`)
      }

      if (this.isPolling) {
        this.pollTimeout = setTimeout(pollLoop, this.config.pollInterval)
      }
    }

    pollLoop()
  }

  /**
   * 停止轮询
   */
  stopPolling(): void {
    this.isPolling = false
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout)
      this.pollTimeout = null
    }
    logger.info('Stopped polling')
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(taskId: string, status: string, data?: unknown): Promise<void> {
    try {
      await this.client.post(`/api/tasks/${taskId}/status`, {
        status,
        data,
        nodeId: this.config.nodeId
      })
      logger.info(`Updated task ${taskId} status to ${status}`)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Failed to update task status: ${error.message}`)
      } else {
        logger.error(`Failed to update task status: ${error}`)
      }
    }
  }
}

export default TaskPoller
