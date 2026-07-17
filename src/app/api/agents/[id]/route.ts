/**
 * Single Agent API
 * PUT    /api/agents/[id]   — 更新 Agent 可编辑字段
 * DELETE /api/agents/[id]   — 删除 Agent（内置 Agent 禁删）
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { agents } from '@/db/schema'
import { eq } from 'drizzle-orm'

// 允许前端修改的字段白名单，isBuiltin/isOrchestrator/createdAt 不可改
const EDITABLE_KEYS = [
  'name',
  'avatar',
  'description',
  'systemPrompt',
  'modelConfigId',
  'toolNames',
  'knowledgeBaseIds',
] as const

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [existing] = await db.select().from(agents).where(eq(agents.id, id))
  if (!existing) return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  for (const key of EDITABLE_KEYS) {
    if (key in body) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 })
  }

  await db.update(agents).set(patch).where(eq(agents.id, id))
  const [updated] = await db.select().from(agents).where(eq(agents.id, id))
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [existing] = await db.select().from(agents).where(eq(agents.id, id))
  if (!existing) return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })
  if (existing.isBuiltin) {
    return NextResponse.json({ error: '内置 Agent 不可删除' }, { status: 403 })
  }

  await db.delete(agents).where(eq(agents.id, id))
  return NextResponse.json({ success: true })
}
