/**
 * Single Conversation API
 * GET    /api/conversations/[id]           — 获取会话详情
 * DELETE /api/conversations/[id]           — 删除会话
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { conversations, messages } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const conv = await db.select().from(conversations).where(eq(conversations.id, id))
  if (conv.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt))

  return NextResponse.json({ ...conv[0], messages: msgs })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.delete(conversations).where(eq(conversations.id, id))
  return NextResponse.json({ success: true })
}
