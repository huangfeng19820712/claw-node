import express, { Request, Response } from 'express'
import { createHmac } from 'crypto'
import { spawn } from 'child_process'
import { logger } from '../utils/logger'
import { Task, TaskStatus, ExecutionResult } from '../types'
import { CallbackClient } from './callback-client'
import { HookReceiver } from './hook-receiver'
import { config } from '../config'

export interface TaskReceiverConfig {
  port: number
  nodeId: string
  nodeSecret: string
  openClawUrl?: string
  onTaskReceived: (task: Task) => Promise<void>
}

/**
 * TaskReceiver - 任务接收器
 * 接收 OpenClaw 推送的任务（推送模式）
 */
export class TaskReceiver {
  private app: express.Application
  private config: TaskReceiverConfig
  private callbackClient: CallbackClient
  private hookReceiver: HookReceiver

  constructor(config: TaskReceiverConfig) {
    this.config = config
    this.app = express()
    this.callbackClient = new CallbackClient(config.openClawUrl || '', config.nodeId)
    this.hookReceiver = new HookReceiver(config.port + 1, this.callbackClient)
  }

  /**
   * 启动接收服务
   */
  async start(): Promise<void> {
    this.app.use(express.json({ limit: '10mb' }))

    // 健康检查
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        nodeId: this.config.nodeId,
        timestamp: new Date().toISOString()
      })
    })

    // 节点状态
    this.app.get('/api/status', (req: Request, res: Response) => {
      res.json({
        nodeId: this.config.nodeId,
        mode: 'push',
        port: this.config.port,
        hookPort: this.config.port + 1
      })
    })

    // 接收任务
    this.app.post('/api/tasks', async (req: Request, res: Response) => {
      try {
        // 验证签名
        const signature = req.headers['x-claw-signature'] as string
        const body = req.body

        if (!this.verifySignature(body, signature)) {
          logger.warn('Invalid signature', { nodeId: this.config.nodeId })
          return res.status(401).json({ error: 'Invalid signature' })
        }

        const task: Task = body.task

        if (!task || !task.id) {
          return res.status(400).json({ error: 'Invalid task format' })
        }

        logger.info('Task received', {
          taskId: task.id,
          type: task.type,
          prompt: task.prompt?.substring(0, 50) + '...'
        })

        // 立即响应
        res.json({ received: true, taskId: task.id })

        // 异步处理任务
        setImmediate(() => this.handleTask(task))

      } catch (error) {
        logger.error('Task receive error', error)
        res.status(500).json({ error: 'Internal error' })
      }
    })

    // 启动 Hook 接收服务
    await this.hookReceiver.start()

    // 启动 HTTP 服务
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        logger.info(`TaskReceiver started on port ${this.config.port}`, {
          nodeId: this.config.nodeId
        })
        resolve()
      })
    })
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen().close(() => {
        logger.info('TaskReceiver stopped')
        resolve()
      })
    })
  }

  /**
   * 处理任务
   */
  private async handleTask(task: Task): Promise<void> {
    const taskLogger = logger.task(task.id)
    taskLogger.info('Handling task (push mode)')

    try {
      // 通知任务开始
      await this.callbackClient.onStart(task.id, {
        nodeId: this.config.nodeId,
        startedAt: new Date().toISOString()
      })

      // 触发 Hook
      await this.hookReceiver.triggerTaskHook(task.hooks, 'onStart', { taskId: task.id })

      // 执行任务
      const result = await this.executeTask(task, taskLogger)

      // 通知任务完成
      if (result.status === TaskStatus.SUCCESS) {
        await this.callbackClient.onComplete(task.id, result)
      } else {
        await this.callbackClient.onError(task.id, result.error || 'Unknown error')
      }

      taskLogger.info(`Task completed: ${result.status}`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      taskLogger.error(`Task failed: ${errorMessage}`)

      await this.callbackClient.onError(task.id, errorMessage)
    }
  }

  /**
   * 执行任务
   */
  private async executeTask(task: Task, taskLogger: any): Promise<ExecutionResult> {
    return new Promise<ExecutionResult>((resolve) => {
      const args: string[] = []

      if (task.prompt) {
        args.push('-p', task.prompt)
      }

      // 继续模式
      if (task.sessionId) {
        args.push('--continue')
      }

      // 工作目录
      if (task.metadata?.workingDirectory) {
        args.push('--cd', String(task.metadata.workingDirectory))
      }

      const child = spawn('claude', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      let output = ''
      let errorOutput = ''

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString()
        output += chunk
        // 实时输出回调
        this.callbackClient.onOutput(task.id, chunk)
      })

      child.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString()
      })

      child.on('error', (err) => {
        taskLogger.error(`Spawn error: ${err.message}`)
        resolve({
          taskId: task.id,
          status: TaskStatus.FAILED,
          error: err.message,
          completedAt: new Date().toISOString()
        })
      })

      child.on('close', (code) => {
        const status = code === 0 ? TaskStatus.SUCCESS : TaskStatus.FAILED
        taskLogger.info(`Task completed with exit code ${code}`)

        resolve({
          taskId: task.id,
          status,
          output: output || undefined,
          error: errorOutput || undefined,
          exitCode: code || 0,
          completedAt: new Date().toISOString()
        })
      })

      // 超时处理
      const timeout = task.timeout || config.execTimeout || 300000
      setTimeout(() => {
        if (child.exitCode === null) {
          taskLogger.warn('Task timeout, killing process')
          child.kill('SIGTERM')
          resolve({
            taskId: task.id,
            status: TaskStatus.FAILED,
            error: 'Execution timeout',
            completedAt: new Date().toISOString()
          })
        }
      }, timeout)
    })
  }

  /**
   * 验证签名
   */
  private verifySignature(body: unknown, signature: string): boolean {
    if (!signature) return false

    const expected = createHmac('sha256', this.config.nodeSecret)
      .update(JSON.stringify(body))
      .digest('hex')

    // 支持两种格式：sha256=xxx 或 直接 hex
    const providedSig = signature.replace('sha256=', '')
    return providedSig === expected
  }
}

export default TaskReceiver
