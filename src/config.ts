import dotenv from 'dotenv'
import { NodeConfig } from './types'

dotenv.config()

export const config: NodeConfig = {
  openClawUrl: process.env.OPENCLAW_URL || 'http://localhost:3000',
  nodeId: process.env.NODE_ID || 'node-001',
  nodeSecret: process.env.NODE_SECRET || '',
  pollInterval: parseInt(process.env.POLL_INTERVAL || '5000', 10),
  hookPort: parseInt(process.env.HOOK_PORT || '3001', 10),
  execTimeout: parseInt(process.env.EXEC_TIMEOUT || '300000', 10),
  claudeApiKey: process.env.CLAUDE_API_KEY || '',
  logLevel: process.env.LOG_LEVEL || 'info'
}

export function validateConfig(): boolean {
  if (!config.nodeSecret) {
    console.warn('NODE_SECRET is not configured')
  }
  if (!config.claudeApiKey) {
    console.warn('CLAUDE_API_KEY is not configured')
  }
  return true
}

export default config
