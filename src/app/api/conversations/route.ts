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

export async function GET() {
  const list = await db.select().from(conversations).orderBy(desc(conversations.updatedAt))
  return NextResponse.json(list)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, mode = 'single', agentIds = [] } = body

  const now = new Date()
  const conversation = {
    id: nanoid(),
    title: title || '新对话',
    mode: mode as 'single' | 'group',
    agentIds,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(conversations).values(conversation)
  return NextResponse.json(conversation, { status: 201 })
}
