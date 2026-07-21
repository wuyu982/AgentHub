/**
 * Settings API — 全局设置（Embedding / Rerank 凭证，RAG 用）
 * GET  /api/settings — 获取设置（脱敏：apiKey 明文绝不出服务端，只回 has* 布尔，§5.2）
 * PUT  /api/settings — 批量更新（apiKey 留空视作"不修改"，避免误清已配置的 key）
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { appSettings } from '@/db/schema'

// 敏感 key：值绝不回前端，只暴露"是否已配置"
const SECRET_KEYS = new Set(['embedding_api_key', 'rerank_api_key'])

export async function GET() {
  const rows = await db.select().from(appSettings)
  const settings: Record<string, string | boolean> = {}
  for (const row of rows) {
    if (SECRET_KEYS.has(row.key)) {
      // 明文绝不出服务端：只回 <key>__set 布尔标记
      settings[`${row.key}__set`] = row.value.length > 0
    } else {
      settings[row.key] = row.value
    }
  }
  // 未落库的敏感 key 也回 false，前端据此显示"未配置"
  for (const k of SECRET_KEYS) {
    if (!(`${k}__set` in settings)) settings[`${k}__set`] = false
  }
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Record<string, string>

  for (const [key, value] of Object.entries(body)) {
    // 敏感 key 留空 = 不修改（保留已有值，避免前端占位符空值误清）
    if (SECRET_KEYS.has(key) && value === '') continue
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } })
  }

  return NextResponse.json({ success: true })
}
