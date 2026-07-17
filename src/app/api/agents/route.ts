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

export async function GET() {
  const list = await db.select().from(agents).orderBy(asc(agents.createdAt))
  return NextResponse.json(list)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    name,
    avatar = '🤖',
    description = '',
    systemPrompt = '',
    modelConfigId = null,
    toolNames = [],
    knowledgeBaseIds = [],
  } = body

  const agent = {
    id: nanoid(),
    name,
    avatar,
    description,
    systemPrompt,
    modelConfigId,
    toolNames,
    knowledgeBaseIds,
    isBuiltin: false,
    isOrchestrator: false,
    createdAt: new Date(),
  }

  await db.insert(agents).values(agent)
  return NextResponse.json(agent, { status: 201 })
}
