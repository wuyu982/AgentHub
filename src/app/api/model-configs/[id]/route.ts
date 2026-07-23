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
import { updateModelConfigBodySchema } from '@/app/api/request-schemas'
import { resolveUpdatedDefault } from '@/lib/model-config-default'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = updateModelConfigBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: '请求参数错误', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const patch = parsed.data
  // apiKey 空串/空白视作"不修改"，避免前端留空回显误清原 key
  if (typeof patch.apiKey === 'string' && !patch.apiKey.trim()) {
    delete patch.apiKey
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '请求参数错误：没有可更新的字段' }, { status: 400 })
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(modelConfigs).where(eq(modelConfigs.id, id))
    if (!existing) return { status: 'not_found' } as const

    const [currentDefault] = await tx
      .select({ id: modelConfigs.id })
      .from(modelConfigs)
      .where(eq(modelConfigs.isDefault, true))
    const decision = resolveUpdatedDefault(existing.isDefault, patch.isDefault, !!currentDefault)
    if (!decision.allowed) return { status: 'conflict', error: decision.error } as const

    if (decision.isDefault !== undefined) patch.isDefault = decision.isDefault
    if (decision.clearOtherDefaults) {
      await tx
        .update(modelConfigs)
        .set({ isDefault: false })
        .where(and(eq(modelConfigs.isDefault, true), ne(modelConfigs.id, id)))
    }

    await tx.update(modelConfigs).set(patch).where(eq(modelConfigs.id, id))
    const [updated] = await tx.select().from(modelConfigs).where(eq(modelConfigs.id, id))
    if (!updated) return { status: 'not_found' } as const
    return { status: 'updated', updated } as const
  })

  if (result.status === 'not_found') {
    return NextResponse.json({ error: '模型配置不存在' }, { status: 404 })
  }
  if (result.status === 'conflict') {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }
  return NextResponse.json(toModelConfigView(result.updated))
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
