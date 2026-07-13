/**
 * Settings API
 * GET  /api/settings       — 获取所有设置
 * PUT  /api/settings       — 批量更新设置
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { appSettings } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const rows = await db.select().from(appSettings)
  const settings: Record<string, string> = {}
  for (const row of rows) {
    settings[row.key] = row.value
  }
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Record<string, string>

  for (const [key, value] of Object.entries(body)) {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } })
  }

  return NextResponse.json({ success: true })
}
