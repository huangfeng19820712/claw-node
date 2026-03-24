import { config, validateConfig } from './config'
import { logger } from './utils/logger'
import { TaskPoller } from './modules/task-poller'
import { Executor } from './modules/executor'
import { SessionManager } from './modules/session-manager'
import { HookReceiver } from './modules/hook-receiver'
import { CallbackClient } from './modules/callback-client'
import { LogStreamer } from './modules/log-streamer'
import { Task, TaskStatus } from './types'

/**
 * ClawNode 主应用
 */
export class ClawNode {
  private taskPoller: TaskPoller
  private executor: Executor
  private sessionManager: SessionManager
  private hookReceiver: HookReceiver
  private callbackClient: CallbackClient

  constructor() {
    validateConfig()

    // 初始化模块
    this.callbackClient = new CallbackClient(config.openClawUrl, config.nodeId)
    this.taskPoller = new TaskPoller(config)
    this.executor = new Executor(this.callbackClient)
    this.sessionManager = new SessionManager()
    this.hookReceiver = new HookReceiver(config.hookPort, this.callbackClient)

    logger.info('ClawNode initialized', {
      nodeId: config.nodeId,
      openClawUrl: config.openClawUrl,
      hookPort: config.hookPort
    })
  }

  /**
   * 启动节点
   */
  async start(): Promise<void> {
    logger.info('Starting ClawNode...')

    // 启动 Hook 接收服务
    await this.hookReceiver.start()

    // 开始轮询任务
    this.taskPoller.startPolling(async (task) => {
      await this.handleTask(task)
    })

    logger.info('ClawNode started successfully')
  }

  /**
   * 停止节点
   */
  async stop(): Promise<void> {
    logger.info('Stopping ClawNode...')

    // 停止轮询
    this.taskPoller.stopPolling()

    // 停止 Hook 接收服务
    await this.hookReceiver.stop()

    logger.info('ClawNode stopped')
  }

  /**
   * 处理任务
   */
  private async handleTask(task: Task): Promise<void> {
    const taskLogger = logger.task(task.id)
    taskLogger.info('Handling task', { type: task.type })

    try {
      // 通知任务开始
      await this.callbackClient.onStart(task.id, {
        nodeId: config.nodeId,
        startedAt: new Date().toISOString()
      })

      // 触发 Hook
      await this.hookReceiver.triggerTaskHook(task.hooks, 'onStart', { taskId: task.id })

      // 创建日志流
      const logStreamer = new LogStreamer(task.id, task.callbackUrl)
      logStreamer.startFlush()

      // 更新状态为运行中
      await this.taskPoller.updateTaskStatus(task.id, TaskStatus.RUNNING)

      // 执行任务
      const result = await this.executor.execute(task, (output) => {
        // 实时输出回调
        this.callbackClient.onOutput(task.id, output)
      })

      // 更新任务状态
      await this.taskPoller.updateTaskStatus(task.id, result.status, {
        output: result.output,
        error: result.error,
        exitCode: result.exitCode
      })

      // 通知任务完成
      await this.callbackClient.onComplete(task.id, result)

      // 触发完成 Hook
      await this.hookReceiver.triggerTaskHook(task.hooks, 'onComplete', result)

      // 停止日志流
      logStreamer.stop()

      taskLogger.info(`Task completed: ${result.status}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      taskLogger.error(`Task failed: ${errorMessage}`)

      // 更新状态为失败
      await this.taskPoller.updateTaskStatus(task.id, TaskStatus.FAILED, {
        error: errorMessage
      })

      // 发送错误回调
      await this.callbackClient.onError(task.id, errorMessage)

      // 触发错误 Hook
      await this.hookReceiver.triggerTaskHook(task.hooks, 'onError', { error: errorMessage })
    }
  }

  /**
   * 获取 Session 管理器
   */
  getSessionManager(): SessionManager {
    return this.sessionManager
  }
}

// 导出所有模块
export * from './types'
export { TaskPoller } from './modules/task-poller'
export { Executor } from './modules/executor'
export { SessionManager } from './modules/session-manager'
export { HookReceiver } from './modules/hook-receiver'
export { CallbackClient } from './modules/callback-client'
export { LogStreamer } from './modules/log-streamer'
export { config } from './config'
export { logger } from './utils/logger'

// 默认导出
export default ClawNode
