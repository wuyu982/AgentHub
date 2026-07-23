/**
 * Model Configs API
 * GET  /api/model-configs   — 获取模型配置列表
 * POST /api/model-configs   — 创建模型配置
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { modelConfigs } from '@/db/schema'
import { asc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { toModelConfigView } from '@/lib/model-config-view'
import { createModelConfigBodySchema } from '@/app/api/request-schemas'
import { resolveCreatedDefault } from '@/lib/model-config-default'

export async function GET() {
  const list = await db.select().from(modelConfigs).orderBy(asc(modelConfigs.createdAt))
  return NextResponse.json(list.map(toModelConfigView))
}

export async function POST(req: NextRequest) {
  const parsed = createModelConfigBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: '请求参数错误', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const config = await db.transaction(async (tx) => {
    const [currentDefault] = await tx
      .select({ id: modelConfigs.id })
      .from(modelConfigs)
      .where(eq(modelConfigs.isDefault, true))
    const created = {
      ...parsed.data,
      id: nanoid(),
      isDefault: resolveCreatedDefault(parsed.data.isDefault, !!currentDefault),
      createdAt: new Date(),
    }

    if (created.isDefault && currentDefault) {
      await tx.update(modelConfigs).set({ isDefault: false }).where(eq(modelConfigs.isDefault, true))
    }
    await tx.insert(modelConfigs).values(created)
    return created
  })

  return NextResponse.json(toModelConfigView(config), { status: 201 })
}
