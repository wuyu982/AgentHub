/**
 * Agents API
 * GET  /api/agents       — 获取 Agent 列表
 * POST /api/agents       — 创建 Agent
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { agents } from '@/db/schema'
import { asc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createAgentBodySchema } from '@/app/api/request-schemas'

export async function GET() {
  const list = await db.select().from(agents).orderBy(asc(agents.createdAt))
  return NextResponse.json(list)
}

export async function POST(req: NextRequest) {
  const parsed = createAgentBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: '请求参数错误', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const agent = {
    ...parsed.data,
    id: nanoid(),
    isBuiltin: false,
    isOrchestrator: false,
    createdAt: new Date(),
  }

  await db.insert(agents).values(agent)
  return NextResponse.json(agent, { status: 201 })
}
