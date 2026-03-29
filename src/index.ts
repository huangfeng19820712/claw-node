import { config, validateConfig } from './config'
import { logger } from './utils/logger'
import { TaskPoller } from './modules/task-poller'
import { Executor } from './modules/executor'
import { SessionManager } from './modules/session-manager'
import { HookReceiver } from './modules/hook-receiver'
import { CallbackClient } from './modules/callback-client'
import { LogStreamer } from './modules/log-streamer'
import { TaskReceiver } from './modules/task-receiver'
import { Task, TaskStatus, TaskType, SessionCommand, SessionStatus } from './types'

/**
 * ClawNode 主应用
 */
export class ClawNode {
  private taskPoller: TaskPoller
  private executor: Executor
  private sessionManager: SessionManager
  private hookReceiver: HookReceiver
  private callbackClient: CallbackClient
  private taskReceiver?: TaskReceiver

  constructor() {
    validateConfig()

    // 初始化模块
    this.callbackClient = new CallbackClient(config.openClawUrl, config.nodeId)
    this.taskPoller = new TaskPoller(config)
    this.executor = new Executor(this.callbackClient)
    this.sessionManager = new SessionManager()
    this.hookReceiver = new HookReceiver(config.hookPort, this.callbackClient)

    // 推送模式：初始化任务接收器
    if (config.mode === 'push' || config.mode === 'hybrid') {
      this.taskReceiver = new TaskReceiver({
        port: config.receiverPort,
        nodeId: config.nodeId,
        nodeSecret: config.nodeSecret,
        openClawUrl: config.openClawUrl,
        onTaskReceived: (task) => this.handleTask(task)
      })
    }

    logger.info('ClawNode initialized', {
      nodeId: config.nodeId,
      openClawUrl: config.openClawUrl,
      hookPort: config.hookPort,
      receiverPort: config.receiverPort,
      mode: config.mode
    })
  }

  /**
   * 启动节点
   */
  async start(): Promise<void> {
    logger.info('Starting ClawNode...', { mode: config.mode })

    // 启动 Hook 接收服务
    await this.hookReceiver.start()

    // 推送模式：启动任务接收服务
    if (this.taskReceiver && (config.mode === 'push' || config.mode === 'hybrid')) {
      await this.taskReceiver.start()
      logger.info('TaskReceiver started in push mode', { port: config.receiverPort })
    }

    // 轮询模式：开始轮询任务
    if (config.mode === 'poll' || config.mode === 'hybrid') {
      this.taskPoller.startPolling(async (task) => {
        await this.handleTask(task)
      })
      logger.info('TaskPoller started in poll mode', { interval: config.pollInterval })
    }

    logger.info('ClawNode started successfully', { mode: config.mode })
  }

  /**
   * 停止节点
   */
  async stop(): Promise<void> {
    logger.info('Stopping ClawNode...')

    // 停止轮询
    this.taskPoller.stopPolling()

    // 停止任务接收服务
    if (this.taskReceiver) {
      await this.taskReceiver.stop()
    }

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

      // 根据任务类型处理
      let result
      switch (task.type) {
        case TaskType.EXECUTE:
          result = await this.handleExecuteTask(task, logStreamer)
          break

        case TaskType.SESSION_CONTINUE:
          result = await this.handleSessionContinue(task, logStreamer)
          break

        case TaskType.SESSION_PAUSE:
          result = await this.handleSessionCommand(task, { action: 'pause', sessionId: task.sessionId })
          break

        case TaskType.SESSION_RESUME:
          result = await this.handleSessionCommand(task, { action: 'resume', sessionId: task.sessionId })
          break

        case TaskType.SESSION_DELETE:
          result = await this.handleSessionCommand(task, { action: 'delete', sessionId: task.sessionId, autoCleanup: true })
          break

        case TaskType.SESSION_LOCK:
          result = await this.handleSessionCommand(task, { action: 'lock', sessionId: task.sessionId })
          break

        case TaskType.SESSION_UNLOCK:
          result = await this.handleSessionCommand(task, { action: 'unlock', sessionId: task.sessionId })
          break

        case TaskType.SESSION_LIST:
          result = await this.handleSessionList(task)
          break

        case TaskType.QUERY:
          result = await this.handleQuery(task)
          break

        default:
          result = await this.handleExecuteTask(task, logStreamer)
      }

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
   * 处理 EXECUTE 任务（带 PRD 文件）
   */
  private async handleExecuteTask(task: Task, logStreamer: LogStreamer): Promise<any> {
    const taskLogger = logger.task(task.id)

    // 检查是否有 sessionId（继续之前的会话）
    let sessionId = task.sessionId
    let session

    if (sessionId) {
      // 复用现有 Session
      session = this.sessionManager.getSession(sessionId)
      if (!session) {
        taskLogger.warn(`Session ${sessionId} not found, creating new one`)
        sessionId = undefined
      }
    }

    if (!sessionId) {
      // 创建新 Session，不允许自动清理
      const newSession = this.sessionManager.createSession(task.id, {
        projectRoot: task.metadata?.projectRoot as string,
        projectType: task.metadata?.projectType as 'new' | 'existing',
        prdPath: task.prdPath,
        workingDirectory: task.metadata?.workingDirectory as string,
        metadata: task.metadata
      }, false) // autoCleanup = false
      sessionId = newSession.id
      taskLogger.info(`Created new session ${sessionId}`)
    }

    // 更新 Session 活动
    this.sessionManager.updateActivity(sessionId)

    // 执行任务
    const result = await this.executor.execute(task, (output) => {
      // 实时输出回调
      this.callbackClient.onOutput(task.id, output)
    }, sessionId)

    // 在 result 中添加 sessionId
    return {
      ...result,
      sessionId
    }
  }

  /**
   * 处理 SESSION_CONTINUE 任务
   */
  private async handleSessionContinue(task: Task, logStreamer: LogStreamer): Promise<any> {
    const sessionId = task.sessionId || task.sessionControl?.sessionId

    if (!sessionId) {
      throw new Error('sessionId is required for SESSION_CONTINUE task')
    }

    const session = this.sessionManager.getSession(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // 恢复 Session（如果是暂停状态）
    if (session.status === SessionStatus.PAUSED) {
      this.sessionManager.resumeSession(sessionId)
    }

    // 更新活动
    this.sessionManager.updateActivity(sessionId)

    // 继续执行消息
    const result = await this.executor.executeSessionMessage(sessionId, task.prompt || '', (output) => {
      this.callbackClient.onOutput(task.id, output)
    })

    return {
      taskId: task.id,
      status: TaskStatus.SUCCESS,
      output: result,
      sessionId,
      completedAt: new Date().toISOString()
    }
  }

  /**
   * 处理 Session 控制指令
   */
  private async handleSessionCommand(task: Task, command: SessionCommand): Promise<any> {
    const result = this.sessionManager.handleCommand(command)

    if (!result.success) {
      throw new Error((result as any).reason || 'Session command failed')
    }

    return {
      taskId: task.id,
      status: TaskStatus.SUCCESS,
      output: JSON.stringify({
        action: command.action,
        sessionId: result.sessionId,
        data: result.data
      }, null, 2),
      completedAt: new Date().toISOString()
    }
  }

  /**
   * 处理 SESSION_LIST 任务
   */
  private async handleSessionList(task: Task): Promise<any> {
    const summaries = this.sessionManager.getSessionSummaries()

    return {
      taskId: task.id,
      status: TaskStatus.SUCCESS,
      output: JSON.stringify({
        sessions: summaries,
        total: summaries.length
      }, null, 2),
      completedAt: new Date().toISOString()
    }
  }

  /**
   * 处理 QUERY 任务
   */
  private async handleQuery(task: Task): Promise<any> {
    // 查询 Session 状态
    if (task.sessionId) {
      const session = this.sessionManager.getSession(task.sessionId)
      if (session) {
        return {
          taskId: task.id,
          status: TaskStatus.SUCCESS,
          output: JSON.stringify({
            type: 'session_info',
            session: {
              id: session.id,
              taskId: session.taskId,
              status: session.status,
              createdAt: session.createdAt,
              lastActivityAt: session.lastActivityAt,
              messageCount: session.messageCount,
              context: session.context,
              isLocked: !session.autoCleanup
            }
          }, null, 2),
          completedAt: new Date().toISOString()
        }
      }
    }

    // 默认查询
    return {
      taskId: task.id,
      status: TaskStatus.SUCCESS,
      output: JSON.stringify({
        type: 'node_info',
        nodeId: config.nodeId,
        sessionCount: this.sessionManager.getSessions().length,
        activeSessions: this.sessionManager.getActiveSessions().length
      }, null, 2),
      completedAt: new Date().toISOString()
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
