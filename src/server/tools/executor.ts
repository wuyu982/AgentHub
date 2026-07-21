/**
 * 工具执行器（L3）—— 并发执行一批 tool call，结果带 callId 顺序对齐。
 * 工具失败兜成 isError（LLM 需要看到失败再决策）；signal abort 冒泡终止整个 run。
 */
import { getTool } from '@/server/tools/registry'
import type { ToolCall, ToolContext, ToolResult } from '@/server/tools/types'
import { requestApproval } from '@/server/approval-registry'

export type ExecutedResult = ToolResult & { callId: string }

export async function executeTools(calls: ToolCall[], ctx: ToolContext): Promise<ExecutedResult[]> {
  return Promise.all(calls.map((call) => executeOne(call, ctx)))
}

async function executeOne(call: ToolCall, ctx: ToolContext): Promise<ExecutedResult> {
  const tool = getTool(call.toolName)
  if (!tool) {
    return { callId: call.callId, result: `未注册的工具: ${call.toolName}`, isError: true }
  }

  // human-in-the-loop：执行前审批判定。deny 直接拒；approve 挂起等前端确认，拒绝/超时不执行
  if (tool.checkApproval) {
    const check = tool.checkApproval(call.args)
    if (check.verdict === 'deny') {
      return { callId: call.callId, result: check.reason, isError: true }
    }
    if (check.verdict === 'approve') {
      const approved = await requestApproval({
        conversationId: ctx.conversationId,
        callId: call.callId,
        toolName: call.toolName,
        summary: check.summary,
      })
      if (!approved) {
        return { callId: call.callId, result: '用户拒绝执行该操作（或审批超时）', isError: true }
      }
    }
  }

  try {
    const res = await tool.execute(call.args, ctx)
    return { callId: call.callId, ...res }
  } catch (err) {
    if (ctx.signal.aborted) throw err // 中止不是业务错误，向上冒泡终止 run
    const message = err instanceof Error ? err.message : String(err)
    return { callId: call.callId, result: `工具执行失败 (${call.toolName}): ${message}`, isError: true }
  }
}
