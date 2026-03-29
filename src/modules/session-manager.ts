import { Session, SessionStatus, SessionContext, SessionCommand } from '../types'
import { logger } from '../utils/logger'

/**
 * Session Manager - Session 管理器
 * 负责管理 Claude Code 的 Session 持续交互
 *
 * Session 生命周期由 OpenClaw 显式控制：
 * - 创建：EXECUTE 任务时自动创建（如果指定 sessionId 则复用）
 * - 继续：发送 SESSION_CONTINUE 任务或指定 sessionId
 * - 暂停：发送 SESSION_PAUSE 任务
 * - 恢复：发送 SESSION_RESUME 任务
 * - 删除：发送 SESSION_DELETE 任务（唯一删除方式）
 * - 锁定：发送 SESSION_LOCK 任务（防止误删）
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map()

  /**
   * 创建新 Session
   * @param taskId 关联的任务 ID
   * @param context Session 上下文（项目根目录、PRD 路径等）
   * @param autoCleanup 是否允许自动清理（默认 false）
   */
  createSession(taskId: string, context?: SessionContext, autoCleanup: boolean = false): Session {
    const session: Session = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      status: SessionStatus.ACTIVE,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      messageCount: 0,
      context,
      autoCleanup
    }

    this.sessions.set(session.id, session)
    logger.info(`Created session ${session.id} for task ${taskId}`, {
      projectRoot: context?.projectRoot,
      projectType: context?.projectType,
      prdPath: context?.prdPath
    })
    return session
  }

  /**
   * 获取 Session
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * 获取或创建 Session
   * - 如果提供了 sessionId，返回该 Session
   * - 如果没有提供 sessionId，创建新 Session
   */
  getOrCreateSession(taskId: string, sessionId?: string, context?: SessionContext): Session {
    if (sessionId) {
      const existing = this.getSession(sessionId)
      if (existing) {
        logger.info(`Reusing existing session ${sessionId}`)
        return existing
      }
      logger.warn(`Session ${sessionId} not found, creating new one`)
    }
    return this.createSession(taskId, context)
  }

  /**
   * 更新 Session 活动
   */
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastActivityAt = new Date().toISOString()
      session.messageCount++
      this.sessions.set(sessionId, session)
    }
  }

  /**
   * 更新 Session 上下文
   */
  updateContext(sessionId: string, context: Partial<SessionContext>): boolean {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.context = { ...session.context, ...context }
      this.sessions.set(sessionId, session)
      logger.info(`Updated session ${sessionId} context`, context)
      return true
    }
    return false
  }

  /**
   * 暂停 Session（等待用户输入）
   */
  pauseSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session && session.status === SessionStatus.ACTIVE) {
      session.status = SessionStatus.PAUSED
      this.sessions.set(sessionId, session)
      logger.info(`Paused session ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 恢复 Session（继续执行）
   */
  resumeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session && session.status === SessionStatus.PAUSED) {
      session.status = SessionStatus.ACTIVE
      this.sessions.set(sessionId, session)
      logger.info(`Resumed session ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 锁定 Session（不允许自动清理）
   */
  lockSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = SessionStatus.LOCKED
      session.autoCleanup = false
      this.sessions.set(sessionId, session)
      logger.info(`Locked session ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 解锁 Session
   */
  unlockSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session && session.status === SessionStatus.LOCKED) {
      session.status = SessionStatus.ACTIVE
      this.sessions.set(sessionId, session)
      logger.info(`Unlocked session ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 删除 Session（唯一删除方式，需要显式调用）
   * @param sessionId Session ID
   * @param force 是否强制删除（即使状态为 LOCKED）
   * @returns 删除结果
   */
  deleteSession(sessionId: string, force: boolean = false): { success: boolean; reason?: string } {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return { success: false, reason: 'Session not found' }
    }

    // 锁定的 Session 需要强制删除
    if (session.status === SessionStatus.LOCKED && !force) {
      logger.warn(`Cannot delete locked session ${sessionId}, use force=true`)
      return { success: false, reason: 'Session is locked, use force=true to delete' }
    }

    this.sessions.delete(sessionId)
    logger.info(`Deleted session ${sessionId}`, {
      wasLocked: session.status === SessionStatus.LOCKED,
      messageCount: session.messageCount,
      duration: Date.now() - new Date(session.createdAt).getTime()
    })
    return { success: true }
  }

  /**
   * 关闭 Session（不删除，只是标记为 closed）
   */
  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session && session.status !== SessionStatus.CLOSED) {
      session.status = SessionStatus.CLOSED
      this.sessions.set(sessionId, session)
      logger.info(`Closed session ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 处理 Session 控制指令
   */
  handleCommand(command: SessionCommand): { success: boolean; sessionId?: string; data?: unknown; reason?: string } {
    switch (command.action) {
      case 'create':
        const newSession = this.createSession(command.sessionId || `task-${Date.now()}`, command.context, command.autoCleanup)
        return { success: true, sessionId: newSession.id }

      case 'continue':
        if (!command.sessionId) {
          return { success: false, reason: 'sessionId is required for continue action' }
        }
        const session = this.getSession(command.sessionId)
        if (!session) {
          return { success: false, reason: `Session ${command.sessionId} not found` }
        }
        if (session.status === SessionStatus.PAUSED || session.status === SessionStatus.CLOSED) {
          this.resumeSession(command.sessionId)
        }
        this.updateActivity(command.sessionId)
        return { success: true, sessionId: command.sessionId }

      case 'pause':
        if (!command.sessionId) {
          return { success: false, reason: 'sessionId is required for pause action' }
        }
        return { success: this.pauseSession(command.sessionId) }

      case 'resume':
        if (!command.sessionId) {
          return { success: false, reason: 'sessionId is required for resume action' }
        }
        return { success: this.resumeSession(command.sessionId) }

      case 'delete':
        if (!command.sessionId) {
          return { success: false, reason: 'sessionId is required for delete action' }
        }
        return this.deleteSession(command.sessionId, command.autoCleanup)

      case 'lock':
        if (!command.sessionId) {
          return { success: false, reason: 'sessionId is required for lock action' }
        }
        return { success: this.lockSession(command.sessionId) }

      case 'unlock':
        if (!command.sessionId) {
          return { success: false, reason: 'sessionId is required for unlock action' }
        }
        return { success: this.unlockSession(command.sessionId) }

      case 'list':
        const sessions = this.getSessions().map(s => ({
          id: s.id,
          taskId: s.taskId,
          status: s.status,
          createdAt: s.createdAt,
          lastActivityAt: s.lastActivityAt,
          messageCount: s.messageCount,
          projectRoot: s.context?.projectRoot,
          projectType: s.context?.projectType,
          isLocked: s.status === SessionStatus.LOCKED || !s.autoCleanup
        }))
        return { success: true, data: { sessions, total: sessions.length } }

      default:
        return { success: false, reason: `Unknown action: ${command.action}` }
    }
  }

  /**
   * 获取 Session 列表
   */
  getSessions(): Session[] {
    return Array.from(this.sessions.values())
  }

  /**
   * 获取活跃 Session（包括 active 和 locked）
   */
  getActiveSessions(): Session[] {
    return this.getSessions().filter(s =>
      s.status === SessionStatus.ACTIVE || s.status === SessionStatus.LOCKED
    )
  }

  /**
   * 获取指定任务的所有 Session
   */
  getSessionsByTask(taskId: string): Session[] {
    return this.getSessions().filter(s => s.taskId === taskId)
  }

  /**
   * 获取所有 Session 摘要（用于 SESSION_LIST）
   */
  getSessionSummaries(): Array<{
    id: string
    taskId: string
    status: string
    createdAt: string
    lastActivityAt: string
    messageCount: number
    projectInfo: string
    isLocked: boolean
  }> {
    return this.getSessions().map(s => ({
      id: s.id,
      taskId: s.taskId,
      status: s.status,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      messageCount: s.messageCount,
      projectInfo: s.context?.projectRoot
        ? `${s.context.projectType || 'unknown'} project at ${s.context.projectRoot}`
        : 'No context',
      isLocked: s.status === SessionStatus.LOCKED || !s.autoCleanup
    }))
  }

  /**
   * 手动清理 Session（只有明确标记 autoCleanup=true 的才会被清理）
   * @param maxAge 最大存活时间（毫秒），默认不清理
   */
  cleanup(maxAge?: number): void {
    if (maxAge === undefined) {
      // 不自动清理
      return
    }

    const now = Date.now()
    for (const [id, session] of this.sessions.entries()) {
      // 只清理明确允许自动清理的 Session
      if (session.autoCleanup) {
        const lastActivity = new Date(session.lastActivityAt).getTime()
        if (now - lastActivity > maxAge && session.status !== SessionStatus.ACTIVE) {
          this.sessions.delete(id)
          logger.info(`Auto-cleaned session ${id} (was eligible for cleanup)`)
        }
      }
    }
  }

  /**
   * 导出 Session 状态（用于持久化）
   */
  exportState(): Record<string, Session> {
    const exportData: Record<string, Session> = {}
    for (const [id, session] of this.sessions.entries()) {
      exportData[id] = session
    }
    return exportData
  }

  /**
   * 导入 Session 状态（用于恢复）
   */
  importState(state: Record<string, Session>): void {
    for (const [id, session] of Object.entries(state)) {
      this.sessions.set(id, session)
    }
    logger.info(`Imported ${Object.keys(state).length} sessions`)
  }
}

export default SessionManager
