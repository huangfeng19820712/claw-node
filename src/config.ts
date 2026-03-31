import dotenv from 'dotenv'
import { NodeConfig } from './types'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// 尝试从用户目录加载配置
function loadUserConfig() {
  const configPath = path.join(os.homedir(), '.clawnode', 'config.env')
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8')
    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim()
        const value = trimmed.substring(eqIndex + 1).trim()
        if (key && value && !process.env[key]) {
          process.env[key] = value
        }
      }
    }
  }
}

// 先加载用户配置，再加载 .env 文件
loadUserConfig()
dotenv.config()

export const config: NodeConfig & {
  receiverPort: number
  mode: 'push' | 'poll' | 'hybrid'
  workdir: string
} = {
  openClawUrl: process.env.OPENCLAW_URL || 'http://localhost:3000',
  nodeId: process.env.NODE_ID || 'node-001',
  nodeSecret: process.env.NODE_SECRET || '',
  pollInterval: parseInt(process.env.POLL_INTERVAL || '5000', 10),
  hookPort: parseInt(process.env.HOOK_PORT || '3001', 10),
  execTimeout: parseInt(process.env.EXEC_TIMEOUT || '300000', 10),
  claudeApiKey: process.env.CLAUDE_API_KEY || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  receiverPort: parseInt(process.env.RECEIVER_PORT || '3000', 10),
  mode: (process.env.RUN_MODE as 'push' | 'poll' | 'hybrid') || 'hybrid',
  workdir: process.env.WORKDIR || os.homedir()
}

export function validateConfig(): boolean {
  if (!config.nodeSecret) {
    console.warn('NODE_SECRET is not configured (required for push mode)')
  }
  if (!config.claudeApiKey) {
    console.warn('CLAUDE_API_KEY is not configured')
  }
  return true
}

export default config
