import { Session } from '../types'
import { logger } from '../utils/logger'

/**
 * Session Manager - Session 管理器
 * 负责管理 Claude Code 的 Session 持续交互
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map()

  /**
   * 创建新 Session
   */
  createSession(taskId: string): Session {
    const session: Session = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      messageCount: 0
    }

    this.sessions.set(session.id, session)
    logger.info(`Created session ${session.id} for task ${taskId}`)
    return session
  }

  /**
   * 获取 Session
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
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
   * 暂停 Session
   */
  pauseSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session && session.status === 'active') {
      session.status = 'paused'
      this.sessions.set(sessionId, session)
      logger.info(`Paused session ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 恢复 Session
   */
  resumeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session && session.status === 'paused') {
      session.status = 'active'
      this.sessions.set(sessionId, session)
      logger.info(`Resumed session ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 关闭 Session
   */
  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session && session.status !== 'closed') {
      session.status = 'closed'
      this.sessions.set(sessionId, session)
      logger.info(`Closed session ${sessionId}`)
      return true
    }
    return false
  }

  /**
   * 获取 Session 列表
   */
  getSessions(): Session[] {
    return Array.from(this.sessions.values())
  }

  /**
   * 获取活跃 Session
   */
  getActiveSessions(): Session[] {
    return this.getSessions().filter(s => s.status === 'active')
  }

  /**
   * 清理过期 Session
   */
  cleanup(maxAge: number = 3600000): void {
    const now = Date.now()
    for (const [id, session] of this.sessions.entries()) {
      const lastActivity = new Date(session.lastActivityAt).getTime()
      if (now - lastActivity > maxAge && session.status !== 'active') {
        this.sessions.delete(id)
        logger.debug(`Cleaned up session ${id}`)
      }
    }
  }
}

export default SessionManager
