/**
 * 审批注册表（L3）—— human-in-the-loop：需审批的工具执行前挂起，等前端确认。
 * requestApproval 发 SSE 事件 + 挂起 Promise；前端确认 API 调 resolveApproval 唤醒。
 * 超时（默认 5min）无响应按拒绝处理，防止 tool-loop 永久挂起（安全优先）。
 */
import { eventBus } from '@/server/event-bus'

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000

interface Pending {
  resolve: (approved: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

// callId → 挂起的审批（callId 全局唯一，来自 adapter 的 tool.call）
const pending = new Map<string, Pending>()

interface ApprovalRequest {
  conversationId: string
  callId: string
  toolName: string
  summary: string // 参数摘要，给用户看清批的是什么（fs_write 路径、bash 命令）
}

// 挂起等待前端确认；resolve(true)=批准，resolve(false)=拒绝/超时
export function requestApproval(req: ApprovalRequest): Promise<boolean> {
  eventBus.emit({
    type: 'approval.request',
    conversationId: req.conversationId,
    timestamp: Date.now(),
    callId: req.callId,
    toolName: req.toolName,
    summary: req.summary,
  })

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(req.callId)
      resolve(false) // 超时按拒绝
    }, APPROVAL_TIMEOUT_MS)
    pending.set(req.callId, { resolve, timer })
  })
}

// 前端确认 API 调用：唤醒挂起的审批。未找到（已超时/重复）静默忽略。
export function resolveApproval(callId: string, approved: boolean): boolean {
  const entry = pending.get(callId)
  if (!entry) return false
  clearTimeout(entry.timer)
  pending.delete(callId)
  entry.resolve(approved)
  return true
}
