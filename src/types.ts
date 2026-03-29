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
  EXECUTE = 'EXECUTE',           // 执行任务（带 PRD 文件）
  SESSION_CONTINUE = 'SESSION_CONTINUE',    // 继续 Session
  SESSION_PAUSE = 'SESSION_PAUSE',          // 暂停 Session
  SESSION_RESUME = 'SESSION_RESUME',        // 恢复 Session
  SESSION_DELETE = 'SESSION_DELETE',        // 删除 Session
  SESSION_LOCK = 'SESSION_LOCK',            // 锁定 Session（不允许自动清理）
  SESSION_UNLOCK = 'SESSION_UNLOCK',        // 解锁 Session
  SESSION_LIST = 'SESSION_LIST',            // 列出所有 Session
  QUERY = 'QUERY'                  // 查询任务
}

// 任务定义
export interface Task {
  id: string
  type: TaskType
  status: TaskStatus
  prompt?: string
  sessionId?: string        // 关联的 Session ID（继续会话时必需）
  callbackUrl?: string
  hooks?: TaskHooks
  createdAt: string
  updatedAt: string
  timeout?: number
  metadata?: Record<string, unknown>
  prdPath?: string          // PRD 文件路径
  sessionControl?: SessionCommand  // Session 控制指令
}

// Session 控制指令
export interface SessionCommand {
  action: 'create' | 'continue' | 'pause' | 'resume' | 'delete' | 'lock' | 'unlock' | 'list'
  sessionId?: string        // 目标 Session ID
  autoCleanup?: boolean     // 是否允许自动清理
  context?: SessionContext  // Session 上下文
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

// Session 状态
export enum SessionStatus {
  ACTIVE = 'active',      // 活跃，可以继续消息
  PAUSED = 'paused',      // 暂停，等待用户输入
  LOCKED = 'locked',      // 锁定，不允许自动关闭
  CLOSED = 'closed'       // 已关闭
}

// Session 上下文
export interface SessionContext {
  projectRoot?: string        // 项目根目录
  projectType?: 'new' | 'existing'  // 项目类型
  prdPath?: string            // PRD 文件路径
  workingDirectory?: string   // 工作目录
  claudeSessionId?: string    // Claude Code 内部 session ID
  metadata?: Record<string, unknown>
}

// Session 定义
export interface Session {
  id: string
  taskId: string
  status: SessionStatus
  createdAt: string
  lastActivityAt: string
  messageCount: number
  context?: SessionContext
  autoCleanup?: boolean     // 是否允许自动清理（默认 false，需要显式删除）
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

// 运行模式
export type RunMode = 'push' | 'poll' | 'hybrid'

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
