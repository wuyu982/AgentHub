/**
 * Approval API — 前端对挂起的工具审批做出决定（批准/拒绝）
 * POST /api/approvals/[callId]  body: { approved: boolean }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveApproval } from '@/server/approval-registry'

const bodySchema = z.object({
  approved: z.boolean(),
}).strict()

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // 唤醒挂起的审批；未找到 = 已超时/重复确认，回 410 让前端清掉本地待审态
  const resolved = resolveApproval(callId, parsed.data.approved)
  if (!resolved) {
    return NextResponse.json({ error: '审批已失效（超时或已处理）' }, { status: 410 })
  }

  return NextResponse.json({ ok: true })
}
