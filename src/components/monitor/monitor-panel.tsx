'use client'

import { useState, useEffect, useCallback } from 'react'
import { Activity, RefreshCw, Loader2 } from 'lucide-react'
import type { MetricsResult, MetricsGroupRow } from '@/app/api/metrics/route'

const fmt = (n: number) => n.toLocaleString('zh-CN')

export function MonitorPanel() {
  const [data, setData] = useState<MetricsResult | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/metrics')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => load(), [load])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">模型流量监控</h1>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : !data || data.totalRuns === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Activity className="h-10 w-10 opacity-40" />
            <p className="text-sm">暂无调用记录，与 Agent 对话后这里会显示 Token 用量统计</p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-8">
            {/* 总览卡片 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="总调用次数" value={fmt(data.totalRuns)} />
              <StatCard label="总 Token" value={fmt(data.totalTokens)} />
              <StatCard label="输入 Token" value={fmt(data.promptTokens)} />
              <StatCard label="输出 Token" value={fmt(data.completionTokens)} />
            </div>
            {data.failedRuns > 0 && (
              <p className="text-xs text-destructive">其中失败调用 {fmt(data.failedRuns)} 次</p>
            )}

            <GroupTable title="按 Agent" rows={data.byAgent} />
            <GroupTable title="按模型" rows={data.byModel} />
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function GroupTable({ title, rows }: { title: string; rows: MetricsGroupRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">名称</th>
              <th className="px-4 py-2 text-right font-medium">调用</th>
              <th className="px-4 py-2 text-right font-medium">输入</th>
              <th className="px-4 py-2 text-right font-medium">输出</th>
              <th className="px-4 py-2 text-right font-medium">总计</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-4 py-2">{r.label}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt(r.runs)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmt(r.promptTokens)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmt(r.completionTokens)}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{fmt(r.totalTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
