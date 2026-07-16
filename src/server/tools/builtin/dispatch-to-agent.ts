/**
 * dispatch_to_agent —— Orchestrator 专用工具：把子任务派给会话内的某个 agent。
 * 校验后调用 ctx.dispatch（runner 注入）；子 agent 独立在群里发消息，其产出作为本工具结果回灌。
 */
import { z } from 'zod'
import { db } from '@/db/client'
import { conversations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { ToolDef } from '@/server/tools/types'

const argsSchema = z.object({
  agentId: z.string().min(1),
  task: z.string().min(1),
})

export const dispatchToAgent: ToolDef = {
  name: 'dispatch_to_agent',
  description:
    '把一个子任务派发给会话内的某个 Agent 执行，返回该 Agent 的完整回答。用于拆解复杂任务并分配给合适的 Agent。',
  parameters: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: '目标 Agent 的 id，必须是当前会话内的成员' },
      task: { type: 'string', description: '交给该 Agent 的具体子任务描述' },
    },
    required: ['agentId', 'task'],
  },
  async execute(args, ctx) {
    const parsed = argsSchema.safeParse(args)
    if (!parsed.success) {
      return { result: `参数非法: ${parsed.error.message}`, isError: true }
    }
    const { agentId, task } = parsed.data

    // 一级派发护栏：子 agent（depth>0）拿不到 dispatch，防止无限自派发
    if (!ctx.dispatch) {
      return { result: '当前上下文不支持派发（子 Agent 不能再派发）', isError: true }
    }

    // 校验目标 agent 在当前会话内
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, ctx.conversationId))
    if (!conv) return { result: `会话不存在: ${ctx.conversationId}`, isError: true }
    if (!conv.agentIds.includes(agentId)) {
      return { result: `Agent ${agentId} 不在当前会话内，无法派发`, isError: true }
    }

    const reply = await ctx.dispatch(agentId, task)
    return { result: reply, isError: false }
  },
}
