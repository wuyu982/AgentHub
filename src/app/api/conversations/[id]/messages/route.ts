/**
 * Messages API — 发送消息并触发 Agent 响应
 * POST /api/conversations/[id]/messages
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { messages, conversations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { runAgent } from '@/server/agent-runner'
import { routeToAgent } from '@/server/agent-router'

const messageBodySchema = z.object({
  content: z.string().min(1),
  mentionedAgentIds: z.array(z.string()).default([]),
}).strict()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params

  const parsed = messageBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { content, mentionedAgentIds } = parsed.data

  // 检查会话是否存在
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId))
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  // 保存用户消息
  const userMessage = {
    id: nanoid(),
    conversationId,
    role: 'user' as const,
    agentId: null,
    parts: [{ type: 'text' as const, content }],
    status: 'complete' as const,
    parentMessageId: null,
    mentionedAgentIds,
    runId: null,
    createdAt: new Date(),
  }

  await db.insert(messages).values(userMessage)

  // 更新会话时间
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))

  // 用户消息由前端 fetch 响应直接入列表，无需再走 SSE（避免重复渲染）

  // 后台触发一个 agent 的流式响应（不 await，API 立即返回）
  const fireRun = (agentId: string) =>
    runAgent(conversationId, agentId, userMessage.id).catch((err) => {
      console.error(`[messages] runAgent failed (agent=${agentId}):`, err)
    })

  // 路由：
  //   显式 @mention → 会话内被 @ 的所有 agent 并发（过滤掉不在会话里的）
  //   单聊无 @      → 唯一 agent
  //   群聊无 @      → AI 路由器异步选出一个 agent（不阻塞 API 响应）
  if (mentionedAgentIds.length > 0) {
    for (const agentId of mentionedAgentIds.filter((id) => conv.agentIds.includes(id))) {
      fireRun(agentId)
    }
  } else if (conv.mode === 'single') {
    if (conv.agentIds[0]) fireRun(conv.agentIds[0])
  } else {
    routeToAgent(conv.agentIds, content)
      .then((agentId) => {
        if (agentId) fireRun(agentId)
      })
      .catch((err) => console.error('[messages] routeToAgent failed:', err))
  }

  return NextResponse.json(userMessage, { status: 201 })
}
