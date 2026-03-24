#!/usr/bin/env node

import { Command } from 'commander'
import { ClawNode } from '../index'
import { config } from '../config'
import { logger } from '../utils/logger'

const program = new Command()

program
  .name('clawnode')
  .description('ClawNode - OpenClaw 执行节点代理')
  .version('1.0.0')

program
  .command('start')
  .description('启动节点服务')
  .option('-p, --port <number>', 'Hook 服务端口', String(config.hookPort))
  .option('-i, --interval <number>', '轮询间隔 (ms)', String(config.pollInterval))
  .action(async (options) => {
    const node = new ClawNode()

    // 优雅退出
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...')
      await node.stop()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...')
      await node.stop()
      process.exit(0)
    })

    await node.start()
  })

program
  .command('exec <prompt...>')
  .description('直接执行 Claude Code 命令')
  .action(async (prompt: string[]) => {
    const { CallbackClient } = await import('../modules/callback-client')
    const { Executor } = await import('../modules/executor')
    const { TaskStatus, TaskType } = await import('../types')

    const callbackClient = new CallbackClient(config.openClawUrl, config.nodeId)
    const executor = new Executor(callbackClient)

    const task = {
      id: `cli-${Date.now()}`,
      type: TaskType.EXECUTE,
      status: TaskStatus.PENDING,
      prompt: prompt.join(' '),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    logger.info(`Executing: ${task.prompt}`)

    const result = await executor.execute(task)

    if (result.output) {
      console.log('\n--- Output ---')
      console.log(result.output)
    }

    if (result.error) {
      console.error('\n--- Error ---')
      console.error(result.error)
    }

    console.log(`\nExit code: ${result.exitCode}`)
    process.exit(result.exitCode || 0)
  })

program
  .command('status')
  .description('显示节点状态')
  .action(() => {
    console.log('ClawNode Status:')
    console.log(`  Node ID: ${config.nodeId}`)
    console.log(`  OpenClaw URL: ${config.openClawUrl}`)
    console.log(`  Hook Port: ${config.hookPort}`)
    console.log(`  Poll Interval: ${config.pollInterval}ms`)
    console.log(`  Exec Timeout: ${config.execTimeout}ms`)
  })

program
  .command('config')
  .description('显示当前配置')
  .action(() => {
    console.log('Current Configuration:')
    console.log(JSON.stringify(config, null, 2))
  })

program.parse()
