import axios, { AxiosInstance } from 'axios'
import { CallbackRequest } from '../types'
import { logger } from '../utils/logger'

/**
 * Callback Client - 回调客户端
 * 负责将执行结果回传到 OpenClaw
 */
export class CallbackClient {
  private client: AxiosInstance
  private nodeId: string

  constructor(baseUrl: string, nodeId: string) {
    this.nodeId = nodeId
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  /**
   * 发送任务开始回调
   */
  async onStart(taskId: string, data?: unknown): Promise<void> {
    await this.sendCallback(taskId, 'start', data)
  }

  /**
   * 发送输出回调
   */
  async onOutput(taskId: string, output: string): Promise<void> {
    await this.sendCallback(taskId, 'output', { output })
  }

  /**
   * 发送完成回调
   */
  async onComplete(taskId: string, data?: unknown): Promise<void> {
    await this.sendCallback(taskId, 'complete', data)
  }

  /**
   * 发送错误回调
   */
  async onError(taskId: string, error: string): Promise<void> {
    await this.sendCallback(taskId, 'error', { error })
  }

  /**
   * 发送通用回调
   */
  private async sendCallback(taskId: string, event: string, data?: unknown): Promise<void> {
    const request: CallbackRequest = {
      taskId,
      event: event as CallbackRequest['event'],
      data,
      nodeId: this.nodeId
    }

    try {
      await this.client.post('/api/callbacks', request)
      logger.debug(`Sent ${event} callback for task ${taskId}`)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Failed to send callback: ${error.message}`)
      } else {
        logger.error(`Failed to send callback: ${error}`)
      }
    }
  }

  /**
   * 发送 Hook 回调
   */
  async sendHook(url: string, data: unknown): Promise<void> {
    try {
      await axios.post(url, data, {
        headers: { 'Content-Type': 'application/json' }
      })
      logger.debug(`Sent hook callback to ${url}`)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error(`Failed to send hook: ${error.message}`)
      } else {
        logger.error(`Failed to send hook: ${error}`)
      }
    }
  }
}

export default CallbackClient
