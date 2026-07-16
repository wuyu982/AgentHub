'use client'

import { useEffect, useState, useCallback } from 'react'
import { Library, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KnowledgeBaseRecord } from '@/shared/types'
import { KnowledgeDetail } from '@/components/knowledge/knowledge-detail'

// 知识库管理主视图：左列 KB 列表（建/删），右侧选中库的文档管理 + 检索测试。
// 数据仅此视图使用，不进全局 store（YAGNI）。
export function KnowledgePanel() {
  const [kbs, setKbs] = useState<KnowledgeBaseRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const loadKbs = useCallback(async () => {
    const res = await fetch('/api/knowledge')
    if (res.ok) setKbs(await res.json())
  }, [])

  useEffect(() => {
    loadKbs()
  }, [loadKbs])

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        const kb = (await res.json()) as KnowledgeBaseRecord
        setKbs((prev) => [kb, ...prev])
        setSelectedId(kb.id)
        setName('')
      } else {
        const err = await res.json()
        alert(`建库失败：${err.error ?? res.statusText}`)
      }
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该知识库？文档与向量将一并清除，不可恢复。')) return
    const res = await fetch(`/api/knowledge/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setKbs((prev) => prev.filter((k) => k.id !== id))
      if (selectedId === id) setSelectedId(null)
    } else {
      const err = await res.json()
      alert(`删除失败：${err.error ?? res.statusText}`)
    }
  }

  const selected = kbs.find((k) => k.id === selectedId) ?? null

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* KB 列表列 */}
      <div className="flex w-64 flex-col border-r">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Library className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">知识库</span>
        </div>

        {/* 建库输入 */}
        <div className="flex gap-1.5 border-b p-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="新建知识库名称"
            className="min-w-0 flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="shrink-0 rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            title="创建"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {kbs.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">暂无知识库</p>
          )}
          {kbs.map((kb) => (
            <div
              key={kb.id}
              className={cn(
                'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                selectedId === kb.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
            >
              <button onClick={() => setSelectedId(kb.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium">{kb.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{kb.embeddingModel}</span>
              </button>
              <button
                onClick={() => handleDelete(kb.id)}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                title="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 详情：文档管理 + 检索测试 */}
      {selected ? (
        <KnowledgeDetail kb={selected} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Library className="h-12 w-12" />
          <p className="text-sm">选择或创建一个知识库</p>
        </div>
      )}
    </div>
  )
}
