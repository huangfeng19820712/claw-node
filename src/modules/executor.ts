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
   * @param task 任务定义
   * @param onOutput 实时输出回调
   * @param sessionId Session ID（用于继续会话）
   */
  async execute(
    task: Task,
    onOutput?: (output: string) => void,
    sessionId?: string
  ): Promise<ExecutionResult> {
    const taskLogger = logger.task(task.id)
    taskLogger.info('Starting task execution', { sessionId })

    return new Promise<ExecutionResult>((resolve) => {
      // 使用 claude 命令执行
      const args: string[] = []

      if (task.prompt) {
        args.push('-p', task.prompt, '--dangerously-skip-permissions')
      }

      // 添加继续模式以支持 session
      const shouldContinue = sessionId || task.sessionId
      if (shouldContinue) {
        args.push('--continue')
      }

      // Windows 平台使用 .cmd 扩展名
      const isWindows = process.platform === 'win32'
      const claudeCommand = isWindows ? 'claude.cmd' : 'claude'

      // 传递环境变量，确保 CLAUDE_CODE_GIT_BASH_PATH 被设置
      const env = { ...process.env }
      if (isWindows && !env.CLAUDE_CODE_GIT_BASH_PATH) {
        try {
          const fs = require('fs')
          const bashPaths = [
            'D:\\Program Files\\Git\\bin\\bash.exe',
            'C:\\Program Files\\Git\\bin\\bash.exe'
          ]
          for (const p of bashPaths) {
            if (fs.existsSync(p)) {
              env.CLAUDE_CODE_GIT_BASH_PATH = p
              break
            }
          }
        } catch {}
      }

      const child = spawn(claudeCommand, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        cwd: task.metadata?.workingDirectory as string || undefined,
        shell: true
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

      child.on('error', (err: Error) => {
        taskLogger.error(`Spawn error: ${err.message}`)
        resolve({
          taskId: task.id,
          status: TaskStatus.FAILED,
          error: err.message,
          completedAt: new Date().toISOString()
        })
      })

      child.on('close', (code: number | null) => {
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
   * 执行 Session 消息（继续会话）
   * @param sessionId Session ID
   * @param message 要发送的消息
   * @param onOutput 实时输出回调
   */
  async executeSessionMessage(
    sessionId: string,
    message: string,
    onOutput?: (output: string) => void
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      // Windows 平台需要使用 .cmd 扩展名和 shell 模式
      const isWindows = process.platform === 'win32'
      const claudeCommand = isWindows ? 'claude.cmd' : 'claude'

      const child = spawn(claudeCommand, ['--continue', '-p', message], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: isWindows
      })

      let output = ''

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString()
        output += chunk
        if (onOutput) {
          onOutput(chunk)
        }
      })

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString()
        output += chunk
        if (onOutput) {
          onOutput(chunk)
        }
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
