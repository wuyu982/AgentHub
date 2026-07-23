/**
 * Single Agent API
 * PUT    /api/agents/[id]   — 更新 Agent 可编辑字段
 * DELETE /api/agents/[id]   — 删除 Agent（内置 Agent 禁删）
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { updateAgentBodySchema } from '@/app/api/request-schemas'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [existing] = await db.select().from(agents).where(eq(agents.id, id))
  if (!existing) return NextResponse.json({ error: 'Agent 不存在' }, { status: 404 })

  const parsed = updateAgentBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: '请求参数错误', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  await db.update(agents).set(parsed.data).where(eq(agents.id, id))
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
