/**
 * Knowledge Base Search API（检索测试用）
 * POST /api/knowledge/[id]/search   — 在单个知识库内检索，返回命中片段
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db/client'
import { knowledgeBases } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { retrieve } from '@/server/rag/retrieval-service'

const searchSchema = z.object({
  query: z.string().min(1),
  kbHint: z.string().optional(),
}).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = searchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: `参数非法: ${parsed.error.message}` }, { status: 400 })
  }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id))
  if (!kb) return NextResponse.json({ error: '知识库不存在' }, { status: 404 })

  try {
    const hits = await retrieve(parsed.data.query, [kb], parsed.data.kbHint, req.signal)
    return NextResponse.json({ hits })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `检索失败: ${msg}` }, { status: 502 })
  }
}
