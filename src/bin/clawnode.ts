#!/usr/bin/env node

import { Command } from 'commander'
import { ClawNode } from '../index'
import { config } from '../config'
import { logger } from '../utils/logger'
import { spawn } from 'child_process'
import { writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

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
  .option('--mode <mode>', '运行模式 (push/poll/hybrid)', 'hybrid')
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
  .option('-s, --session <id>', '使用指定 Session ID')
  .option('-w, --workdir <dir>', '工作目录')
  .option('-n, --notify', '执行完成后发送通知到渠道', false)
  .action(async (prompt: string[], options) => {
    const { CallbackClient } = await import('../modules/callback-client')
    const { Executor } = await import('../modules/executor')
    const { TaskStatus, TaskType } = await import('../types')
    const { HookReceiver } = await import('../modules/hook-receiver')

    const callbackClient = new CallbackClient(config.openClawUrl, config.nodeId)
    const executor = new Executor(callbackClient)
    const hookReceiver = new HookReceiver(config.hookPort, callbackClient)

    const taskId = `cli-${Date.now()}`
    const task = {
      id: taskId,
      type: TaskType.EXECUTE,
      status: TaskStatus.PENDING,
      prompt: prompt.join(' '),
      sessionId: options.session,
      metadata: {
        workingDirectory: options.workdir
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    logger.info(`Executing: ${task.prompt}`)

    // 启动 Hook 服务（用于通知）
    if (options.notify) {
      await hookReceiver.start()
      logger.info('Hook receiver started for notifications')
    }

    // 发送开始通知
    if (options.notify) {
      try {
        await writeFile('.logs/task-start.json', JSON.stringify({
          taskId,
          event: 'start',
          data: {
            status: 'RUNNING',
            nodeId: config.nodeId,
            prompt: task.prompt
          },
          timestamp: new Date().toISOString()
        }, null, 2))

        // 触发通知脚本
        await triggerNotifyHook('start', taskId, {
          status: 'RUNNING',
          nodeId: config.nodeId,
          prompt: task.prompt
        })
      } catch (err) {
        logger.warn('Failed to send start notification', err)
      }
    }

    const result = await executor.execute(task)

    if (result.output) {
      console.log('\n--- Output ---')
      console.log(result.output)
    }

    if (result.error) {
      console.error('\n--- Error ---')
      console.error(result.error)
    }

    // 发送完成通知
    if (options.notify) {
      try {
        const event = result.status === TaskStatus.SUCCESS ? 'complete' : 'error'
        await triggerNotifyHook(event, taskId, {
          status: result.status,
          nodeId: config.nodeId,
          output: result.output,
          error: result.error,
          exitCode: result.exitCode
        })
        console.log('\n✓ Notification sent to channel')
      } catch (err) {
        logger.warn('Failed to send completion notification', err)
      }
    }

    console.log(`\nExit code: ${result.exitCode}`)
    process.exit(result.exitCode || 0)
  })

program
  .command('run <prompt...>')
  .description('执行并发送通知到渠道（exec --notify 的快捷方式）')
  .option('-s, --session <id>', '使用指定 Session ID')
  .option('-w, --workdir <dir>', '工作目录')
  .action(async (prompt: string[], options) => {
    // 重用 exec 命令逻辑，添加 notify 选项
    const execOptions = { ...options, notify: true }

    const { CallbackClient } = await import('../modules/callback-client')
    const { Executor } = await import('../modules/executor')
    const { TaskStatus, TaskType } = await import('../types')
    const { HookReceiver } = await import('../modules/hook-receiver')

    const callbackClient = new CallbackClient(config.openClawUrl, config.nodeId)
    const executor = new Executor(callbackClient)
    const hookReceiver = new HookReceiver(config.hookPort, callbackClient)

    const taskId = `cli-${Date.now()}`
    const task = {
      id: taskId,
      type: TaskType.EXECUTE,
      status: TaskStatus.PENDING,
      prompt: prompt.join(' '),
      sessionId: options.session,
      metadata: {
        workingDirectory: options.workdir
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    logger.info(`Executing: ${task.prompt}`)

    // 启动 Hook 服务（用于通知）
    await hookReceiver.start()
    logger.info('Hook receiver started for notifications')

    // 发送开始通知
    try {
      await writeFile('.logs/task-start.json', JSON.stringify({
        taskId,
        event: 'start',
        data: {
          status: 'RUNNING',
          nodeId: config.nodeId,
          prompt: task.prompt
        },
        timestamp: new Date().toISOString()
      }, null, 2))

      await triggerNotifyHook('start', taskId, {
        status: 'RUNNING',
        nodeId: config.nodeId,
        prompt: task.prompt
      })
    } catch (err) {
      logger.warn('Failed to send start notification', err)
    }

    const result = await executor.execute(task)

    if (result.output) {
      console.log('\n--- Output ---')
      console.log(result.output)
    }

    if (result.error) {
      console.error('\n--- Error ---')
      console.error(result.error)
    }

    // 发送完成通知
    try {
      const event = result.status === TaskStatus.SUCCESS ? 'complete' : 'error'
      await triggerNotifyHook(event, taskId, {
        status: result.status,
        nodeId: config.nodeId,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode
      })
      console.log('\n✓ Notification sent to channel')
    } catch (err) {
      logger.warn('Failed to send completion notification', err)
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
    console.log(`  Run Mode: ${config.mode}`)
    console.log(`  Receiver Port: ${config.receiverPort}`)
  })

program
  .command('config')
  .description('显示当前配置')
  .action(() => {
    console.log('Current Configuration:')
    console.log(JSON.stringify(config, null, 2))
  })

program
  .command('ws-send')
  .description('通过 WebSocket call 帧直接发送消息到渠道')
  .requiredOption('--to <target>', '目标地址（号码、用户名、频道 ID）')
  .requiredOption('--message <text>', '消息内容')
  .option('--channel <channel>', '渠道名称', 'whatsapp')
  .option('--gateway <host>', 'Gateway 主机', process.env.GATEWAY_HOST || 'localhost')
  .option('--port <port>', 'Gateway 端口', process.env.GATEWAY_PORT || '18789')
  .option('--device-token <token>', '设备 Token', process.env.DEVICE_TOKEN || '')
  .option('--device-id <id>', '设备 ID', process.env.DEVICE_ID || '')
  .option('--private-key <key>', '私钥 (base64url)', process.env.PRIVATE_KEY || '')
  .option('--public-key <key>', '公钥 (base64url)', process.env.PUBLIC_KEY || '')
  .action(async (options) => {
    const { WebSocketSender } = await import('../modules/websocket-sender')

    if (!options.deviceToken || !options.deviceId || !options.privateKey || !options.publicKey) {
      console.error('Error: device-token, device-id, private-key, and public-key are required')
      console.error('')
      console.error('获取认证信息的步骤:')
      console.error('  1. 在 Gateway 上生成邀请码')
      console.error('     node /data/openclaw/plugins/node-auto-register/scripts/generate-invite-code.js my-node')
      console.error('  2. 获取设备 token')
      console.error('     curl "http://gateway:18789/plugins/node-auto-register/api/one-shot-pair?inviteCode=xxx"')
      console.error('  3. 生成 ED25519 密钥对')
      console.error('     clawnode ws-generate-keys')
      process.exit(1)
    }

    const sender = new WebSocketSender({
      gatewayHost: options.gateway,
      gatewayPort: parseInt(options.port),
      deviceToken: options.deviceToken,
      deviceId: options.deviceId,
      privateKey: options.privateKey,
      publicKey: options.publicKey,
    })

    try {
      console.log(`[ClawNode] Connecting to ws://${options.gateway}:${options.port}...`)
      await sender.connect()
      console.log('[ClawNode] Connected successfully')

      console.log(`[ClawNode] Sending message to ${options.to} via ${options.channel}...`)
      const result = await sender.sendMessage(options.to, options.message, {
        channel: options.channel,
      })

      console.log('[ClawNode] Message sent successfully!')
      console.log('Result:')
      console.log(`  Message ID: ${result.messageId}`)
      console.log(`  Channel: ${result.channel}`)
      console.log(`  To JID: ${result.toJid}`)

      sender.disconnect()
    } catch (error) {
      console.error('[ClawNode] Send failed:', (error as Error).message)
      sender.disconnect()
      process.exit(1)
    }
  })

program
  .command('ws-generate-keys')
  .description('生成 ED25519 密钥对')
  .action(() => {
    const { WebSocketSender } = require('../modules/websocket-sender')
    const { privateKey, publicKey } = WebSocketSender.generateKeyPair()
    console.log('ED25519 Key Pair Generated:')
    console.log('====================================')
    console.log(`PUBLIC_KEY=${publicKey}`)
    console.log('------------------------------------')
    console.log(`PRIVATE_KEY=${privateKey}`)
    console.log('====================================')
    console.log('')
    console.log('请将 PUBLIC_KEY 注册到 Gateway，并妥善保管 PRIVATE_KEY')
  })

program.parse()

/**
 * 从 OpenClaw identity 目录加载设备凭证
 */
function loadOpenClawIdentity(): {
  deviceId: string
  deviceToken: string
  privateKey: string
  publicKey: string
} | null {
  const fs = require('fs')
  const path = require('path')
  const os = require('os')

  const identityDir = path.join(os.homedir(), '.openclaw', 'identity')
  const deviceAuthPath = path.join(identityDir, 'device-auth.json')
  const devicePath = path.join(identityDir, 'device.json')

  try {
    if (!fs.existsSync(deviceAuthPath) || !fs.existsSync(devicePath)) {
      return null
    }

    const deviceAuth = JSON.parse(fs.readFileSync(deviceAuthPath, 'utf8'))
    const device = JSON.parse(fs.readFileSync(devicePath, 'utf8'))

    // 获取 node token
    const token = deviceAuth.tokens?.node?.token
    if (!token) {
      return null
    }

    return {
      deviceId: device.deviceId || deviceAuth.deviceId,
      deviceToken: token,
      privateKey: device.privateKeyPem || '',
      publicKey: device.publicKeyPem || '',
    }
  } catch (err) {
    logger.debug(`Failed to load OpenClaw identity: ${(err as Error).message}`)
    return null
  }
}

/**
 * 发送通知到渠道
 */
async function triggerNotifyHook(event: string, taskId: string, data: any): Promise<void> {
  const channel = process.env.NOTIFY_CHANNEL || 'feishu'
  const target = process.env.NOTIFY_TARGET || ''

  if (!target) {
    logger.warn('NOTIFY_TARGET not configured, skipping notification')
    return
  }

  // 构建消息内容
  const emoji = event === 'start' ? '🚀' : event === 'complete' ? '✅' : event === 'error' ? '❌' : '📢'
  const title = event === 'start' ? '任务开始执行' : event === 'complete' ? '任务完成' : event === 'error' ? '任务失败' : '任务状态更新'

  const nodeId = data.nodeId || config.nodeId
  const status = data.status || ''
  const output = data.output || ''
  const error = data.error || ''

  let message = `${emoji} *ClawNode ${title}*\n\n`
  message += `📋 **任务 ID**: \`${taskId}\`\n`
  message += `🖥️ **节点**: \`${nodeId}\`\n`
  message += `📊 **状态**: \`${status}\`\n`

  if (output) {
    const summary = output.substring(0, 400).replace(/\n/g, ' ')
    message += `\n📝 **执行摘要**: ${summary}`
  }

  if (error) {
    const errSummary = error.substring(0, 200).replace(/\n/g, ' ')
    message += `\n⚠️ **错误信息**: ${errSummary}`
  }

  // 使用 WebSocketSender 发送消息
  const { WebSocketSender } = await import('../modules/websocket-sender')

  // 优先从 OpenClaw identity 目录加载凭证
  const identity = loadOpenClawIdentity()

  // 环境变量中的值（可能是 placeholder）
  const envDeviceId = process.env.DEVICE_ID || ''
  const envDeviceToken = process.env.DEVICE_TOKEN || ''
  const envPrivateKey = process.env.PRIVATE_KEY || ''
  const envPublicKey = process.env.PUBLIC_KEY || ''

  // 使用真实值（优先 identity，其次环境变量）
  const deviceId = identity?.deviceId || envDeviceId
  const deviceToken = identity?.deviceToken || envDeviceToken
  const privateKey = identity?.privateKey || envPrivateKey
  const publicKey = identity?.publicKey || envPublicKey

  if (identity) {
    logger.info('Using credentials from OpenClaw identity directory')
  }

  const sender = new WebSocketSender({
    gatewayHost: process.env.GATEWAY_HOST || 'localhost',
    gatewayPort: parseInt(process.env.GATEWAY_PORT || '18789', 10),
    deviceToken,
    deviceId,
    privateKey,
    publicKey,
  })

  try {
    logger.info('Connecting to Gateway for notification...')
    await sender.connect()
    logger.info('Sending notification via WebSocket...')
    await sender.sendMessage(target, message, { channel })
    logger.info('Notification sent successfully')
    sender.disconnect()
  } catch (err) {
    logger.warn(`Notification failed: ${(err as Error).message}`)
    sender.disconnect()
  }
}
