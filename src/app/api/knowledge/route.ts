/**
 * Knowledge Bases API
 * GET  /api/knowledge   — 列出所有知识库
 * POST /api/knowledge   — 建库（探测维度 → 建 Milvus collection → 写 SQLite）
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db/client'
import { knowledgeBases } from '@/db/schema'
import { desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { resolveEmbeddingCredentials } from '@/server/credentials'
import { probeDimension } from '@/server/rag/embedding-service'
import { createCollection } from '@/server/rag/milvus-client'

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  embeddingModel: z.string().optional(), // 空则用全局默认 embedding 模型
}).strict()

export async function GET() {
  const list = await db.select().from(knowledgeBases).orderBy(desc(knowledgeBases.createdAt))
  return NextResponse.json(list)
}

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: `参数非法: ${parsed.error.message}` }, { status: 400 })
  }
  const { name, description = '', embeddingModel } = parsed.data

  // 解析实际使用的 embedding 模型（建库时定死，决定向量维度）
  const { model } = await resolveEmbeddingCredentials(embeddingModel)
  const id = nanoid()
  const collectionName = `kb_${id.replace(/[^a-zA-Z0-9]/g, '')}` // Milvus collection 名只允许字母数字下划线

  try {
    const dim = await probeDimension(model)
    await createCollection(collectionName, dim)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `建库失败（Milvus/Embedding）: ${msg}` }, { status: 502 })
  }

  const kb = { id, name, description, embeddingModel: model, collectionName, createdAt: new Date() }
  await db.insert(knowledgeBases).values(kb)
  return NextResponse.json(kb, { status: 201 })
}
