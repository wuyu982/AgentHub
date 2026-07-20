/**
 * Single Artifact API
 * GET /api/artifacts/[id]   — 取产物完整内容，供前端预览渲染
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { artifacts } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [artifact] = await db.select().from(artifacts).where(eq(artifacts.id, id))
  if (!artifact) return NextResponse.json({ error: '产物不存在' }, { status: 404 })
  return NextResponse.json(artifact)
}
