/**
 * Single Knowledge Base API
 * DELETE /api/knowledge/[id]   — 删库（删 Milvus collection + SQLite 级联删文档/chunks）
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { knowledgeBases } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { dropCollection } from '@/server/rag/milvus-client'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id))
  if (!kb) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await dropCollection(kb.collectionName)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `删除 Milvus collection 失败: ${msg}` }, { status: 502 })
  }

  // documents/chunks 靠外键 onDelete:cascade 级联删除
  await db.delete(knowledgeBases).where(eq(knowledgeBases.id, id))
  return NextResponse.json({ success: true })
}
