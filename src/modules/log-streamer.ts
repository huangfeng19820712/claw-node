import { logger } from '../utils/logger'

/**
 * Log Streamer - 日志流式输出
 * 负责将执行日志流式输出到控制台或远程服务
 */
export class LogStreamer {
  private taskId: string
  private buffer: string[] = []
  private flushInterval: NodeJS.Timeout | null = null
  private remoteUrl?: string

  constructor(taskId: string, remoteUrl?: string) {
    this.taskId = taskId
    this.remoteUrl = remoteUrl
  }

  /**
   * 写入日志
   */
  write(chunk: string): void {
    this.buffer.push(chunk)

    // 实时输出到控制台
    process.stdout.write(chunk)
  }

  /**
   * 写入行
   */
  writeln(line: string): void {
    this.write(line + '\n')
  }

  /**
   * 启动定时刷新
   */
  startFlush(intervalMs: number = 1000): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }

    this.flushInterval = setInterval(() => {
      this.flush()
    }, intervalMs)
  }

  /**
   * 刷新缓冲区
   */
  flush(): void {
    if (this.buffer.length === 0) return

    const content = this.buffer.join('')
    this.buffer = []

    // 发送到远程服务
    if (this.remoteUrl) {
      this.sendRemote(content)
    }

    logger.debug(`Flushed ${content.length} bytes for task ${this.taskId}`)
  }

  private async sendRemote(content: string): Promise<void> {
    if (!this.remoteUrl) return

    try {
      const response = await fetch(this.remoteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          taskId: this.taskId,
          content,
          timestamp: new Date().toISOString()
        })
      })

      if (!response.ok) {
        logger.error(`Failed to send log to remote: ${response.status}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to send log to remote: ${error.message}`)
      }
    }
  }

  /**
   * 停止流式输出
   */
  stop(): void {
    this.flush()

    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
  }

  /**
   * 获取完整日志
   */
  getFullLog(): string {
    return this.buffer.join('')
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.buffer = []
  }
}

export default LogStreamer
