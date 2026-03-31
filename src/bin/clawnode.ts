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

program
  .command('feishu-download')
  .description('从飞书下载附件')
  .requiredOption('--message-id <id>', '飞书消息 ID')
  .requiredOption('--file-key <key>', '飞书文件 Key')
  .requiredOption('--output <path>', '输出文件路径')
  .option('--app-id <id>', '飞书 App ID (env: FEISHU_APP_ID)')
  .option('--app-secret <secret>', '飞书 App Secret (env: FEISHU_APP_SECRET)')
  .action(async (options) => {
    const { downloadFeishuFile, getFeishuConfig } = await import('../modules/feishu-downloader')

    // 获取配置：优先命令行参数，其次环境变量，最后用户配置文件
    let appId = options.appId || ''
    let appSecret = options.appSecret || ''

    if (!appId || !appSecret) {
      const config = getFeishuConfig()
      if (config) {
        appId = appId || config.appId
        appSecret = appSecret || config.appSecret
      }
    }

    if (!appId || !appSecret) {
      console.error('Error: FEISHU_APP_ID and FEISHU_APP_SECRET are required')
      console.error('')
      console.error('配置方式 (按优先级):')
      console.error('  1. 命令行参数: --app-id xxx --app-secret xxx')
      console.error('  2. 环境变量: FEISHU_APP_ID=xxx FEISHU_APP_SECRET=xxx clawnode feishu-download ...')
      console.error('  3. 用户配置文件: ~/.openclaw/feishu.env')
      console.error('')
      console.error('配置文件格式 (~/.openclaw/feishu.env):')
      console.error('  FEISHU_APP_ID=cli_xxx')
      console.error('  FEISHU_APP_SECRET=xxx')
      process.exit(1)
    }

    console.log(`[FeishuDownload] 飞书附件下载`)
    console.log(`  Message ID: ${options.messageId}`)
    console.log(`  File Key: ${options.fileKey}`)
    console.log(`  Output: ${options.output}`)

    const result = await downloadFeishuFile(
      options.messageId,
      options.fileKey,
      options.output,
      {
        appId,
        appSecret,
      }
    )

    if (result.success) {
      console.log('\n✅ 下载成功!')
      console.log(`文件已保存到: ${result.filePath}`)
      process.exit(0)
    } else {
      console.error('\n❌ 下载失败!')
      console.error(`错误: ${result.error}`)
      process.exit(1)
    }
  })

program
  .command('feishu-exec')
  .description('执行飞书开发任务（有附件先下载再执行，无附件直接执行）')
  .option('--message-id <id>', '飞书消息 ID（可选，有附件时使用）')
  .option('--file-key <key>', '飞书文件 Key（可选，有附件时使用）')
  .option('--workdir <dir>', '工作目录（默认当前目录）')
  .option('--prompt <text>', '开发任务描述')
  .option('--notify-to <to>', '通知目标（飞书 open_id）')
  .option('--app-id <id>', '飞书 App ID (env: FEISHU_APP_ID)')
  .option('--app-secret <secret>', '飞书 App Secret (env: FEISHU_APP_SECRET)')
  .action(async (options) => {
    const { downloadFeishuFile, getFeishuConfig } = await import('../modules/feishu-downloader')
    const { CallbackClient } = await import('../modules/callback-client')
    const { Executor } = await import('../modules/executor')
    const { TaskStatus, TaskType } = await import('../types')

    // 判断是否有附件
    const hasAttachment = !!(options.messageId && options.fileKey)
    // 如果没有指定工作目录，使用配置中的默认目录
    const workdir = (options.workdir || config.workdir).replace(/\\/, '/')

    // 任务描述
    let prompt = options.prompt || ''
    if (!prompt) {
      console.error('Error: --prompt is required')
      process.exit(1)
    }

    // 第一步：如果有附件，先下载
    if (hasAttachment) {
      // 获取飞书配置
      let appId = options.appId || ''
      let appSecret = options.appSecret || ''

      if (!appId || !appSecret) {
        const config = getFeishuConfig()
        if (config) {
          appId = appId || config.appId
          appSecret = appSecret || config.appSecret
        }
      }

      if (!appId || !appSecret) {
        console.error('Error: FEISHU_APP_ID and FEISHU_APP_SECRET are required for attachment download')
        process.exit(1)
      }

      const outputPath = `${workdir}/${options.messageId}.md`

      console.log(`\n[Step 1/2] 下载飞书附件...`)
      const downloadResult = await downloadFeishuFile(
        options.messageId,
        options.fileKey,
        outputPath,
        { appId, appSecret }
      )

      if (!downloadResult.success) {
        console.error(`\n❌ 下载失败: ${downloadResult.error}`)
        process.exit(1)
      }
      console.log(`✅ 下载成功: ${outputPath}`)

      prompt = `根据 ${outputPath} ${prompt}`
    }

    // 增强 prompt，要求 Claude 输出详细信息
    const enhancedPrompt = `${prompt}

重要：完成任务后，请用以下格式返回结果：

---
📁 **项目路径**: ${workdir}

📋 **完成内容**:
- [列出创建/修改的文件]
- [简要说明每个文件的作用]

🚀 **运行方式**:
- [如何运行项目/如何使用]

✅ **任务状态**: 已完成
---`

    // 第二步：执行开发任务
    console.log(hasAttachment ? `\n[Step 2/2] 执行开发任务...` : `\n[Step 1/1] 执行开发任务...`)
    console.log(`[FeishuExec] 工作目录: ${workdir}`)

    const callbackClient = new CallbackClient(config.openClawUrl, config.nodeId)
    const executor = new Executor(callbackClient)

    const taskId = `cli-${Date.now()}`
    const task = {
      id: taskId,
      type: TaskType.EXECUTE,
      status: TaskStatus.PENDING,
      prompt: enhancedPrompt,
      sessionId: undefined,
      metadata: {
        workingDirectory: workdir
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // 通知目标
    const notifyTarget = options.notifyTo || process.env.NOTIFY_TARGET || ''

    // 异步发送开始通知（不等待）
    if (notifyTarget) {
      triggerNotifyHook('start', taskId, {
        status: 'RUNNING',
        nodeId: config.nodeId,
        prompt: options.prompt,
        target: notifyTarget
      }).catch(err => logger.warn('Start notification failed:', err.message))
    }

    const result = await executor.execute(task)

    // 异步发送完成通知（不等待）
    // 注意：Gateway 的 nodes.run 是同步 RPC，超时后会丢弃结果
    // 所以这里发通知也没用，飞书通知已经通过独立通道发送了
    // 不再发送完成通知到 Gateway

    // 输出结果
    console.log(`\n${'='.repeat(50)}`)
    console.log(`\n✅ 任务完成\n`)
    if (result.output) {
      console.log(result.output)
    }
    console.log(`\n${'='.repeat(50)}`)
    console.log(`Exit code: ${result.exitCode}`)
    process.exit(result.exitCode || 0)
  })

program.parse()

/**
 * 加载或创建 clawnode 专用身份
 * 使用独立的身份目录 ~/.clawnode/identity/，避免与 openclaw node run 冲突
 */
function loadOrCreateClawnodeIdentity(): {
  deviceId: string
  deviceToken: string
  privateKey: string
  publicKey: string
} | null {
  const fs = require('fs')
  const path = require('path')
  const os = require('os')
  const crypto = require('crypto')

  // clawnode 专用身份目录
  const identityDir = path.join(os.homedir(), '.clawnode', 'identity')
  const devicePath = path.join(identityDir, 'device.json')
  const deviceAuthPath = path.join(identityDir, 'device-auth.json')

  try {
    // 读取 device.json（包含密钥对）
    if (!fs.existsSync(devicePath)) {
      logger.warn(`Device identity not found at ${devicePath}`)
      return null
    }

    const device = JSON.parse(fs.readFileSync(devicePath, 'utf8'))
    if (!device.deviceId || !device.privateKeyPem || !device.publicKeyPem) {
      logger.warn(`Invalid device identity at ${devicePath}`)
      return null
    }

    // 读取 device-auth.json（包含 token）
    let deviceToken = ''
    if (fs.existsSync(deviceAuthPath)) {
      const deviceAuth = JSON.parse(fs.readFileSync(deviceAuthPath, 'utf8'))
      deviceToken = deviceAuth.tokens?.node?.token || ''
    }

    logger.info(`Using clawnode identity from ${identityDir}`)
    if (deviceToken) {
      logger.info(`Device token found`)
    } else {
      logger.warn(`No device token found - run 'openclaw node run' first to register`)
    }

    return {
      deviceId: device.deviceId,
      deviceToken,
      privateKey: device.privateKeyPem,
      publicKey: device.publicKeyPem,
    }
  } catch (err) {
    logger.debug(`Failed to load/create clawnode identity: ${(err as Error).message}`)
    return null
  }
}

/**
 * 从 OpenClaw identity 目录加载设备凭证（已废弃，使用 loadOrCreateClawnodeIdentity）
 */
function loadOpenClawIdentity(): {
  deviceId: string
  deviceToken: string
  privateKey: string
  publicKey: string
} | null {
  // 使用 clawnode 专用身份，不再与 openclaw node run 冲突
  return loadOrCreateClawnodeIdentity()
}

/**
 * 发送通知到渠道
 */
async function triggerNotifyHook(event: string, taskId: string, data: any): Promise<void> {
  const channel = process.env.NOTIFY_CHANNEL || 'feishu'
  const target = data.target || process.env.NOTIFY_TARGET || ''

  if (!target) {
    logger.warn('NOTIFY_TARGET not configured, skipping notification')
    return
  }

  // 构建消息内容
  const emoji = event === 'start' ? '🚀' : event === 'complete' ? '✅' : event === 'error' ? '❌' : '📢'
  const title = event === 'start' ? '任务开始执行' : event === 'complete' ? '开发任务完成' : event === 'error' ? '任务失败' : '任务状态更新'

  const nodeId = data.nodeId || config.nodeId
  const status = data.status || ''
  const output = data.output || ''
  const error = data.error || ''
  const workdir = data.workdir || ''

  let message = `${emoji} *${title}*\n\n`

  if (event === 'start') {
    message += `📋 **任务**: ${data.prompt || '开发任务'}\n`
    message += `🖥️ **节点**: \`${nodeId}\`\n`
    message += `📊 **状态**: 运行中...\n`
  } else if (event === 'complete') {
    message += `✅ **任务**: ${data.prompt || '开发任务'}\n`
    message += `🖥️ **节点**: \`${nodeId}\`\n`
    if (workdir) {
      message += `📁 **项目路径**: \`${workdir}\`\n`
    }
    message += `📊 **状态**: 执行成功\n\n`
    // 输出 Claude 的完整结果
    if (output) {
      message += `${output}`
    }
  } else if (event === 'error') {
    message += `❌ **任务**: ${data.prompt || '开发任务'}\n`
    message += `🖥️ **节点**: \`${nodeId}\`\n`
    message += `📊 **状态**: 执行失败\n`
    if (error) {
      message += `\n⚠️ **错误信息**:\n\`\`\`\n${error}\n\`\`\`\n`
    }
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
