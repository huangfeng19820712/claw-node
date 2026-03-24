import { spawn } from 'child_process'
import { Task, TaskStatus, ExecutionResult } from '../types'
import { logger } from '../utils/logger'
import { CallbackClient } from './callback-client'

/**
 * Executor - 任务执行器
 * 负责调用 Claude Code 执行任务
 */
export class Executor {
  private callbackClient: CallbackClient

  constructor(callbackClient: CallbackClient) {
    this.callbackClient = callbackClient
  }

  /**
   * 执行任务
   */
  async execute(task: Task, onOutput?: (output: string) => void): Promise<ExecutionResult> {
    const taskLogger = logger.task(task.id)
    taskLogger.info('Starting task execution')

    return new Promise<ExecutionResult>((resolve) => {
      // 使用 claude 命令执行
      const args: string[] = []

      if (task.prompt) {
        args.push('-p', task.prompt)
      }

      // 添加继续模式以支持 session
      if (task.sessionId) {
        args.push('--continue')
      }

      const child = spawn('claude', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      let output = ''
      let errorOutput = ''

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString()
        output += chunk
        taskLogger.debug(`Output: ${chunk.substring(0, 100)}...`)

        if (onOutput) {
          onOutput(chunk)
        }
      })

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString()
        errorOutput += chunk
        taskLogger.warn(`Stderr: ${chunk.substring(0, 100)}...`)
      })

      child.on('error', (err) => {
        taskLogger.error(`Spawn error: ${err.message}`)
        resolve({
          taskId: task.id,
          status: TaskStatus.FAILED,
          error: err.message,
          completedAt: new Date().toISOString()
        })
      })

      child.on('close', (code) => {
        const status = code === 0 ? TaskStatus.SUCCESS : TaskStatus.FAILED
        taskLogger.info(`Task completed with exit code ${code}`)

        resolve({
          taskId: task.id,
          status,
          output: output || undefined,
          error: errorOutput || undefined,
          exitCode: code || 0,
          completedAt: new Date().toISOString()
        })
      })

      // 超时处理
      const timeout = task.timeout || 300000
      setTimeout(() => {
        if (child.exitCode === null) {
          taskLogger.warn('Task timeout, killing process')
          child.kill('SIGTERM')
          resolve({
            taskId: task.id,
            status: TaskStatus.FAILED,
            error: 'Execution timeout',
            completedAt: new Date().toISOString()
          })
        }
      }, timeout)
    })
  }

  /**
   * 执行 Session 消息
   */
  async executeSessionMessage(sessionId: string, message: string): Promise<string> {
    return new Promise<string>((resolve) => {
      const child = spawn('claude', ['--continue', '-p', message], {
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let output = ''

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString()
      })

      child.stderr.on('data', (data: Buffer) => {
        output += data.toString()
      })

      child.on('close', () => {
        resolve(output)
      })

      // 向 stdin 写入消息
      child.stdin.write(message + '\n')
      child.stdin.end()
    })
  }
}

export default Executor
