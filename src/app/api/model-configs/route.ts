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

export async function GET() {
  const list = await db.select().from(modelConfigs).orderBy(asc(modelConfigs.createdAt))
  return NextResponse.json(list.map(toModelConfigView))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    name,
    adapterName = 'openai-compatible',
    provider = null,
    modelId = null,
    baseURL = null,
    apiKey = null,
    isDefault = false,
  } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: '模型配置名称不能为空' }, { status: 400 })
  }

  const config = {
    id: nanoid(),
    name,
    adapterName,
    provider,
    modelId,
    baseURL,
    apiKey,
    isDefault,
    createdAt: new Date(),
  }

  // 设为默认时，清掉其他配置的默认标记（保证全局唯一默认）
  if (isDefault) {
    await db.update(modelConfigs).set({ isDefault: false }).where(eq(modelConfigs.isDefault, true))
  }

  await db.insert(modelConfigs).values(config)
  return NextResponse.json(toModelConfigView(config), { status: 201 })
}
