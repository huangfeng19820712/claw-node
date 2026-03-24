import { LogEntry } from '../types'

export class Logger {
  private logLevel: string

  constructor(logLevel: string = 'info') {
    this.logLevel = logLevel
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error']
    const currentLevelIndex = levels.indexOf(this.logLevel)
    const logLevelIndex = levels.indexOf(level)
    return logLevelIndex >= currentLevelIndex
  }

  private formatEntry(entry: LogEntry): string {
    const timestamp = new Date().toISOString()
    const context = []
    if (entry.taskId) context.push(`[${entry.taskId}]`)
    if (entry.sessionId) context.push(`[Session:${entry.sessionId}]`)
    return `[${timestamp}] ${entry.level.toUpperCase()} ${context.join('')} ${entry.message}`
  }

  debug(message: string, data?: unknown, taskId?: string, sessionId?: string): void {
    if (!this.shouldLog('debug')) return
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      taskId,
      sessionId,
      message,
      data
    }
    console.debug(this.formatEntry(entry))
  }

  info(message: string, data?: unknown, taskId?: string, sessionId?: string): void {
    if (!this.shouldLog('info')) return
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      taskId,
      sessionId,
      message,
      data
    }
    console.info(this.formatEntry(entry))
  }

  warn(message: string, data?: unknown, taskId?: string, sessionId?: string): void {
    if (!this.shouldLog('warn')) return
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      taskId,
      sessionId,
      message,
      data
    }
    console.warn(this.formatEntry(entry))
  }

  error(message: string, data?: unknown, taskId?: string, sessionId?: string): void {
    if (!this.shouldLog('error')) return
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      taskId,
      sessionId,
      message,
      data
    }
    console.error(this.formatEntry(entry))
  }

  task(taskId: string) {
    return {
      debug: (message: string, data?: unknown) => this.debug(message, data, taskId),
      info: (message: string, data?: unknown) => this.info(message, data, taskId),
      warn: (message: string, data?: unknown) => this.warn(message, data, taskId),
      error: (message: string, data?: unknown) => this.error(message, data, taskId)
    }
  }
}

export const logger = new Logger()
