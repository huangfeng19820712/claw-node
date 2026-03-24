import express, { Express, Request, Response } from 'express'
import { Task, TaskHooks } from '../types'
import { logger } from '../utils/logger'
import { CallbackClient } from './callback-client'

/**
 * Hook Receiver - Hook 回调接收器
 * 负责接收和处理 Hook 回调
 */
export class HookReceiver {
  private app: Express
  private port: number
  private callbackClient: CallbackClient
  private server: any = null

  constructor(port: number, callbackClient: CallbackClient) {
    this.port = port
    this.callbackClient = callbackClient
    this.app = express()
    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware(): void {
    this.app.use(express.json())
    this.app.use(express.text())
  }

  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    // 接收 Hook 回调
    this.app.post('/hooks/:taskId/:event', (req: Request, res: Response) => {
      const { taskId, event } = req.params
      const data = req.body

      logger.info(`Received hook: ${event} for task ${taskId}`)

      // 处理 hook 事件
      this.handleHook(taskId, event, data)

      res.json({ received: true })
    })

    // Session 相关接口
    this.app.post('/session/:sessionId/message', (req: Request, res: Response) => {
      const { sessionId } = req.params
      const { message } = req.body

      logger.info(`Received message for session ${sessionId}`)

      res.json({ received: true, sessionId })
    })
  }

  private handleHook(taskId: string, event: string, data: unknown): void {
    switch (event) {
      case 'start':
        logger.info(`Task ${taskId} started`, data)
        break
      case 'output':
        logger.debug(`Task ${taskId} output: ${data}`)
        break
      case 'complete':
        logger.info(`Task ${taskId} completed`, data)
        break
      case 'error':
        logger.error(`Task ${taskId} error: ${data}`)
        break
      default:
        logger.warn(`Unknown hook event: ${event}`)
    }
  }

  /**
   * 启动 Hook 接收服务
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info(`Hook receiver started on port ${this.port}`)
        resolve()
      })
    })
  }

  /**
   * 停止 Hook 接收服务
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Hook receiver stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  /**
   * 触发任务 Hook
   */
  async triggerTaskHook(hooks: TaskHooks | undefined, event: keyof TaskHooks, data: unknown): Promise<void> {
    if (!hooks || !hooks[event]) {
      return
    }

    const hookUrl = hooks[event]!
    if (hookUrl) {
      await this.callbackClient.sendHook(hookUrl, data)
    }
  }
}

export default HookReceiver
