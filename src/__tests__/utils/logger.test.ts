/**
 * Logger 单元测试
 */

import { Logger } from '../../utils/logger'

describe('Logger', () => {
  let logger: Logger
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    logger = new Logger('debug')
    consoleSpy = jest.spyOn(console, 'info').mockImplementation()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  describe('构造函数', () => {
    it('应该使用默认日志级别', () => {
      const defaultLogger = new Logger()
      expect(defaultLogger).toBeDefined()
    })

    it('应该接受自定义日志级别', () => {
      const debugLogger = new Logger('debug')
      expect(debugLogger).toBeDefined()
    })
  })

  describe('日志级别过滤', () => {
    it('应该过滤低于配置级别的日志', () => {
      const warnLogger = new Logger('warn')
      const spy = jest.spyOn(console, 'debug').mockImplementation()

      warnLogger.debug('This should not appear')

      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    })

    it('应该允许高于配置级别的日志通过', () => {
      const debugLogger = new Logger('debug')
      const spy = jest.spyOn(console, 'error').mockImplementation()

      debugLogger.error('This should appear')

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('日志方法', () => {
    it('info 应该输出日志', () => {
      logger.info('Test message')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('info 应该包含 taskId 上下文', () => {
      logger.info('Test message', null, 'task-123')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[task-123]')
      )
    })

    it('info 应该包含 sessionId 上下文', () => {
      logger.info('Test message', null, undefined, 'session-456')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Session:session-456]')
      )
    })
  })

  describe('task 方法', () => {
    it('应该返回带有 taskId 上下文的日志对象', () => {
      const taskLogger = logger.task('test-task')

      expect(taskLogger.debug).toBeDefined()
      expect(taskLogger.info).toBeDefined()
      expect(taskLogger.warn).toBeDefined()
      expect(taskLogger.error).toBeDefined()

      taskLogger.info('Task message')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[test-task]')
      )
    })
  })
})
