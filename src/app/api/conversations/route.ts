/**
 * Conversations API
 * GET  /api/conversations       — 获取会话列表
 * POST /api/conversations       — 创建新会话
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { conversations } from '@/db/schema'
import { desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createConversationBodySchema } from '@/app/api/request-schemas'

export async function GET() {
  const list = await db.select().from(conversations).orderBy(desc(conversations.updatedAt))
  return NextResponse.json(list)
}

export async function POST(req: NextRequest) {
  const parsed = createConversationBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: '请求参数错误', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { title, mode, agentIds } = parsed.data

  const now = new Date()
  const conversation = {
    id: nanoid(),
    title: title || '新对话',
    mode,
    agentIds,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(conversations).values(conversation)
  return NextResponse.json(conversation, { status: 201 })
}
