/**
 * SessionManager 单元测试
 */

import { SessionManager } from '../../modules/session-manager'

describe('SessionManager', () => {
  let sessionManager: SessionManager

  beforeEach(() => {
    sessionManager = new SessionManager()
  })

  describe('createSession', () => {
    it('应该创建一个新的 session', () => {
      const session = sessionManager.createSession('task-123')

      expect(session.id).toBeDefined()
      expect(session.taskId).toBe('task-123')
      expect(session.status).toBe('active')
      expect(session.messageCount).toBe(0)
    })

    it('应该生成唯一的 session id', () => {
      const session1 = sessionManager.createSession('task-123')
      const session2 = sessionManager.createSession('task-123')

      expect(session1.id).not.toBe(session2.id)
    })
  })

  describe('getSession', () => {
    it('应该获取已存在的 session', () => {
      const created = sessionManager.createSession('task-123')
      const retrieved = sessionManager.getSession(created.id)

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe(created.id)
    })

    it('应该返回 undefined 对于不存在的 session', () => {
      const session = sessionManager.getSession('non-existent')

      expect(session).toBeUndefined()
    })
  })

  describe('updateActivity', () => {
    it('应该更新 session 的活动时间', () => {
      const session = sessionManager.createSession('task-123')
      const beforeUpdate = session.lastActivityAt

      // 等待一小段时间
      setTimeout(() => {
        sessionManager.updateActivity(session.id)
        const updated = sessionManager.getSession(session.id)

        expect(updated?.lastActivityAt).not.toBe(beforeUpdate)
        expect(updated?.messageCount).toBe(1)
      }, 10)
    })

    it('应该增加消息计数', () => {
      const session = sessionManager.createSession('task-123')

      sessionManager.updateActivity(session.id)
      sessionManager.updateActivity(session.id)
      sessionManager.updateActivity(session.id)

      const updated = sessionManager.getSession(session.id)
      expect(updated?.messageCount).toBe(3)
    })
  })

  describe('pauseSession', () => {
    it('应该暂停活跃的 session', () => {
      const session = sessionManager.createSession('task-123')

      const result = sessionManager.pauseSession(session.id)

      expect(result).toBe(true)
      expect(sessionManager.getSession(session.id)?.status).toBe('paused')
    })

    it('应该返回 false 对于已暂停的 session', () => {
      const session = sessionManager.createSession('task-123')
      sessionManager.pauseSession(session.id)

      const result = sessionManager.pauseSession(session.id)

      expect(result).toBe(false)
    })
  })

  describe('resumeSession', () => {
    it('应该恢复已暂停的 session', () => {
      const session = sessionManager.createSession('task-123')
      sessionManager.pauseSession(session.id)

      const result = sessionManager.resumeSession(session.id)

      expect(result).toBe(true)
      expect(sessionManager.getSession(session.id)?.status).toBe('active')
    })

    it('应该返回 false 对于已关闭的 session', () => {
      const session = sessionManager.createSession('task-123')
      sessionManager.closeSession(session.id)

      const result = sessionManager.resumeSession(session.id)

      expect(result).toBe(false)
    })
  })

  describe('closeSession', () => {
    it('应该关闭 session', () => {
      const session = sessionManager.createSession('task-123')

      const result = sessionManager.closeSession(session.id)

      expect(result).toBe(true)
      expect(sessionManager.getSession(session.id)?.status).toBe('closed')
    })
  })

  describe('getSessions', () => {
    it('应该返回所有 session', () => {
      sessionManager.createSession('task-1')
      sessionManager.createSession('task-2')
      sessionManager.createSession('task-3')

      const sessions = sessionManager.getSessions()

      expect(sessions).toHaveLength(3)
    })
  })

  describe('getActiveSessions', () => {
    it('应该只返回活跃的 session', () => {
      const s1 = sessionManager.createSession('task-1')
      const s2 = sessionManager.createSession('task-2')
      const s3 = sessionManager.createSession('task-3')

      sessionManager.pauseSession(s2.id)
      sessionManager.closeSession(s3.id)

      const active = sessionManager.getActiveSessions()

      expect(active).toHaveLength(1)
      expect(active[0].id).toBe(s1.id)
    })
  })

  describe('cleanup', () => {
    it('应该清理过期的非活跃 session', () => {
      const session = sessionManager.createSession('task-123')
      sessionManager.pauseSession(session.id)

      // 模拟过期
      session.lastActivityAt = new Date(Date.now() - 7200000).toISOString()

      sessionManager.cleanup(3600000) // 1 小时

      expect(sessionManager.getSession(session.id)).toBeUndefined()
    })
  })
})
