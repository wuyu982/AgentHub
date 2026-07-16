/**
 * Documents API
 * GET  /api/knowledge/[id]/documents   — 列出知识库下文档
 * POST /api/knowledge/[id]/documents   — 上传文档（建 Document → 同步 ingestion）
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { knowledgeBases, documents } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { ingestDocument } from '@/server/rag/ingestion-service'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const list = await db
    .select()
    .from(documents)
    .where(eq(documents.knowledgeBaseId, id))
    .orderBy(desc(documents.createdAt))
  return NextResponse.json(list)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id))
  if (!kb) return NextResponse.json({ error: '知识库不存在' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少文件（字段名 file）' }, { status: 400 })
  }

  const docId = nanoid()
  await db.insert(documents).values({
    id: docId,
    knowledgeBaseId: id,
    filename: file.name,
    mimeType: file.type || '',
    status: 'pending',
    chunkCount: 0,
    createdAt: new Date(),
  })

  // 本地单机，同步跑完 ingestion 后返回最终状态（大文件异步化留后续）
  const bytes = new Uint8Array(await file.arrayBuffer())
  await ingestDocument(kb, docId, bytes, file.type || undefined, req.signal)

  const [doc] = await db.select().from(documents).where(eq(documents.id, docId))
  return NextResponse.json(doc, { status: 201 })
}
