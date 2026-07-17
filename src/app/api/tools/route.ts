/**
 * Tools API
 * GET /api/tools   — 列出所有已注册工具（name + description），供 Agent 配置界面多选
 */
import { NextResponse } from 'next/server'
import { listTools } from '@/server/tools/registry'

export async function GET() {
  return NextResponse.json(listTools())
}
