/**
 * Metrics API — 聚合 agentRuns 的 token 用量统计
 * GET /api/metrics — 总览 + 按 Agent 分组 + 按模型分组
 */
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { agentRuns, agents } from '@/db/schema'
import { sql, eq, desc } from 'drizzle-orm'

export interface MetricsGroupRow {
  key: string // agentId 或 modelId
  label: string // Agent 名 / 模型名
  runs: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface MetricsResult {
  totalRuns: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  failedRuns: number
  byAgent: MetricsGroupRow[]
  byModel: MetricsGroupRow[]
}

export async function GET() {
  // 总览
  const [overview] = await db
    .select({
      totalRuns: sql<number>`count(*)`,
      totalTokens: sql<number>`coalesce(sum(${agentRuns.totalTokens}), 0)`,
      promptTokens: sql<number>`coalesce(sum(${agentRuns.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${agentRuns.completionTokens}), 0)`,
      failedRuns: sql<number>`coalesce(sum(case when ${agentRuns.status} = 'failed' then 1 else 0 end), 0)`,
    })
    .from(agentRuns)

  // 按 Agent 分组（join 取名字）
  const agentRows = await db
    .select({
      key: agentRuns.agentId,
      label: agents.name,
      runs: sql<number>`count(*)`,
      promptTokens: sql<number>`coalesce(sum(${agentRuns.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${agentRuns.completionTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${agentRuns.totalTokens}), 0)`,
    })
    .from(agentRuns)
    .leftJoin(agents, eq(agentRuns.agentId, agents.id))
    .groupBy(agentRuns.agentId)
    .orderBy(desc(sql`sum(${agentRuns.totalTokens})`))

  // 按模型分组
  const modelRows = await db
    .select({
      key: agentRuns.modelId,
      runs: sql<number>`count(*)`,
      promptTokens: sql<number>`coalesce(sum(${agentRuns.promptTokens}), 0)`,
      completionTokens: sql<number>`coalesce(sum(${agentRuns.completionTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${agentRuns.totalTokens}), 0)`,
    })
    .from(agentRuns)
    .groupBy(agentRuns.modelId)
    .orderBy(desc(sql`sum(${agentRuns.totalTokens})`))

  const result: MetricsResult = {
    totalRuns: overview?.totalRuns ?? 0,
    totalTokens: overview?.totalTokens ?? 0,
    promptTokens: overview?.promptTokens ?? 0,
    completionTokens: overview?.completionTokens ?? 0,
    failedRuns: overview?.failedRuns ?? 0,
    byAgent: agentRows.map((r) => ({
      key: r.key ?? '(unknown)',
      label: r.label ?? '(已删除 Agent)',
      runs: r.runs,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
    })),
    byModel: modelRows.map((r) => ({
      key: r.key ?? '(未记录)',
      label: r.key ?? '(未记录)',
      runs: r.runs,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
    })),
  }

  return NextResponse.json(result)
}
