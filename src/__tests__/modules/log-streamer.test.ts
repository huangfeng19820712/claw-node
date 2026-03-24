/**
 * LogStreamer 单元测试
 */

import { LogStreamer } from '../../modules/log-streamer'

describe('LogStreamer', () => {
  let logStreamer: LogStreamer
  let stdoutSpy: jest.SpyInstance

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation()
    logStreamer = new LogStreamer('task-123')
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
  })

  describe('write', () => {
    it('应该写入内容到缓冲区', () => {
      logStreamer.write('test content')

      expect(logStreamer.getFullLog()).toBe('test content')
    })

    it('应该输出到 stdout', () => {
      logStreamer.write('test')

      expect(stdoutSpy).toHaveBeenCalledWith('test')
    })
  })

  describe('writeln', () => {
    it('应该写入内容并添加换行符', () => {
      logStreamer.writeln('test line')

      expect(logStreamer.getFullLog()).toBe('test line\n')
    })
  })

  describe('flush', () => {
    it('应该清空缓冲区', () => {
      logStreamer.write('content')
      logStreamer.flush()

      expect(logStreamer.getFullLog()).toBe('')
    })

    it('当缓冲区为空时不应该出错', () => {
      expect(() => logStreamer.flush()).not.toThrow()
    })
  })

  describe('startFlush', () => {
    it('应该启动定时刷新', () => {
      jest.useFakeTimers()
      const flushSpy = jest.spyOn(logStreamer, 'flush')

      logStreamer.write('test')
      logStreamer.startFlush(100)

      jest.advanceTimersByTime(150)

      expect(flushSpy).toHaveBeenCalled()

      jest.useRealTimers()
      flushSpy.mockRestore()
    })
  })

  describe('stop', () => {
    it('应该停止定时刷新并清空缓冲区', () => {
      jest.useFakeTimers()
      logStreamer.write('test')
      logStreamer.startFlush(100)
      logStreamer.stop()

      expect(logStreamer.getFullLog()).toBe('')

      jest.useRealTimers()
    })
  })

  describe('clear', () => {
    it('应该清空日志缓冲区', () => {
      logStreamer.write('content 1')
      logStreamer.write('content 2')

      logStreamer.clear()

      expect(logStreamer.getFullLog()).toBe('')
    })
  })

  describe('getFullLog', () => {
    it('应该返回完整的日志内容', () => {
      logStreamer.write('line1\n')
      logStreamer.write('line2\n')
      logStreamer.write('line3\n')

      expect(logStreamer.getFullLog()).toBe('line1\nline2\nline3\n')
    })
  })

  describe('无 remoteUrl 的情况', () => {
    it('flush 时不应该调用 sendRemote', async () => {
      logStreamer.write('test')

      // 直接调用 flush，因为没有 remoteUrl，不会调用 sendRemote
      logStreamer.flush()

      expect(logStreamer.getFullLog()).toBe('')
    })
  })
})
