/**
 * ClawNode 类型定义
 */

// 任务状态
export enum TaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  FAILED = 'FAILED',
  RETRY = 'RETRY',
  SUCCESS = 'SUCCESS'
}

// 任务类型
export enum TaskType {
  EXECUTE = 'EXECUTE',
  SESSION = 'SESSION',
  QUERY = 'QUERY'
}

// 任务定义
export interface Task {
  id: string
  type: TaskType
  status: TaskStatus
  prompt?: string
  sessionId?: string
  callbackUrl?: string
  hooks?: TaskHooks
  createdAt: string
  updatedAt: string
  timeout?: number
  metadata?: Record<string, unknown>
}

// Hook 配置
export interface TaskHooks {
  onStart?: string
  onOutput?: string
  onComplete?: string
  onError?: string
}

// 执行结果
export interface ExecutionResult {
  taskId: string
  status: TaskStatus
  output?: string
  error?: string
  exitCode?: number
  completedAt: string
}

// Session 定义
export interface Session {
  id: string
  taskId: string
  status: 'active' | 'paused' | 'closed'
  createdAt: string
  lastActivityAt: string
  messageCount: number
}

// 节点配置
export interface NodeConfig {
  openClawUrl: string
  nodeId: string
  nodeSecret: string
  pollInterval: number
  hookPort: number
  execTimeout: number
  claudeApiKey: string
  logLevel: string
}

// 日志条目
export interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  taskId?: string
  sessionId?: string
  message: string
  data?: unknown
}

// 轮询响应
export interface PollResponse {
  task?: Task
  shouldPoll: boolean
  interval?: number
}

// 回调请求
export interface CallbackRequest {
  taskId: string
  event: 'start' | 'output' | 'complete' | 'error'
  data: unknown
  nodeId?: string
}
