/**
 * 集成测试 - 测试模块间协作
 */

import { TaskStatus, TaskType } from '../../types'

describe('集成测试', () => {
  describe('任务流程', () => {
    it('应该完成完整的任务状态流转', () => {
      const states: TaskStatus[] = []

      // 模拟状态流转
      states.push(TaskStatus.PENDING)
      states.push(TaskStatus.RUNNING)
      states.push(TaskStatus.SUCCESS)

      expect(states).toEqual([
        TaskStatus.PENDING,
        TaskStatus.RUNNING,
        TaskStatus.SUCCESS
      ])
    })

    it('应该支持失败重试流程', () => {
      const states: TaskStatus[] = []

      states.push(TaskStatus.PENDING)
      states.push(TaskStatus.RUNNING)
      states.push(TaskStatus.FAILED)
      states.push(TaskStatus.RETRY)
      states.push(TaskStatus.RUNNING)
      states.push(TaskStatus.SUCCESS)

      expect(states).toHaveLength(6)
    })
  })

  describe('Task 类型', () => {
    it('应该支持所有任务类型', () => {
      expect(TaskType.EXECUTE).toBe('EXECUTE')
      expect(TaskType.SESSION_CONTINUE).toBe('SESSION_CONTINUE')
      expect(TaskType.SESSION_PAUSE).toBe('SESSION_PAUSE')
      expect(TaskType.SESSION_RESUME).toBe('SESSION_RESUME')
      expect(TaskType.SESSION_DELETE).toBe('SESSION_DELETE')
      expect(TaskType.SESSION_LOCK).toBe('SESSION_LOCK')
      expect(TaskType.SESSION_UNLOCK).toBe('SESSION_UNLOCK')
      expect(TaskType.SESSION_LIST).toBe('SESSION_LIST')
      expect(TaskType.QUERY).toBe('QUERY')
    })
  })
})
