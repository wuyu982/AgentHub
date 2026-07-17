/**
 * Single Model Config API
 * PUT    /api/model-configs/[id]   — 更新模型配置
 * DELETE /api/model-configs/[id]   — 删除（默认配置 / 被 Agent 引用时禁删）
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { modelConfigs, agents } from '@/db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { toModelConfigView } from '@/lib/model-config-view'

const EDITABLE_KEYS = ['name', 'adapterName', 'provider', 'modelId', 'baseURL', 'apiKey', 'isDefault'] as const

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [existing] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, id))
  if (!existing) return NextResponse.json({ error: '模型配置不存在' }, { status: 404 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  for (const key of EDITABLE_KEYS) {
    if (key in body) patch[key] = body[key]
  }
  // apiKey 空串/空白视作"不修改"，避免前端留空回显误清原 key
  if (typeof patch.apiKey === 'string' && !patch.apiKey.trim()) {
    delete patch.apiKey
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '没有可更新的字段' }, { status: 400 })
  }

  // 设为默认时，清掉其他配置的默认标记
  if (patch.isDefault === true) {
    await db
      .update(modelConfigs)
      .set({ isDefault: false })
      .where(and(eq(modelConfigs.isDefault, true), ne(modelConfigs.id, id)))
  }

  await db.update(modelConfigs).set(patch).where(eq(modelConfigs.id, id))
  const [updated] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, id))
  return NextResponse.json(toModelConfigView(updated))
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [existing] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, id))
  if (!existing) return NextResponse.json({ error: '模型配置不存在' }, { status: 404 })
  if (existing.isDefault) {
    return NextResponse.json({ error: '默认模型配置不可删除' }, { status: 403 })
  }

  // 被 Agent 引用时禁删，避免悬空引用
  const referencing = await db.select().from(agents).where(eq(agents.modelConfigId, id))
  if (referencing.length > 0) {
    const names = referencing.map((a) => a.name).join('、')
    return NextResponse.json({ error: `该配置正被 Agent 使用：${names}` }, { status: 409 })
  }

  await db.delete(modelConfigs).where(eq(modelConfigs.id, id))
  return NextResponse.json({ success: true })
}
