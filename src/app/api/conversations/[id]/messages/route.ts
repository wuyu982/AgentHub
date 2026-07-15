/**
 * Messages API — 发送消息并触发 Agent 响应
 * POST /api/conversations/[id]/messages
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { messages, conversations } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { eventBus } from '@/server/event-bus'
import { runAgent } from '@/server/agent-runner'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params
  const body = await req.json()
  const { content, mentionedAgentIds = [] } = body

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

  // 通知前端收到用户消息
  eventBus.emit({
    type: 'message.start',
    conversationId,
    timestamp: Date.now(),
    messageId: userMessage.id,
    agentId: '',
    runId: '',
  })
  eventBus.emit({
    type: 'message.end',
    conversationId,
    timestamp: Date.now(),
    messageId: userMessage.id,
  })

  // 选定响应的 agent：优先 @mention，否则取会话内第一个
  const targetAgentId = mentionedAgentIds[0] ?? conv.agentIds[0]
  if (targetAgentId) {
    // 不 await：让 Agent 在后台流式响应，API 立即返回
    runAgent(conversationId, targetAgentId, userMessage.id).catch((err) => {
      console.error('[messages] runAgent failed:', err)
    })
  }

  return NextResponse.json(userMessage, { status: 201 })
}
