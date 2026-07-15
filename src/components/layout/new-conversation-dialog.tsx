'use client'

import { useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NewConversationDialogProps {
  onClose: () => void
}

export function NewConversationDialog({ onClose }: NewConversationDialogProps) {
  const agents = useAppStore((s) => s.agents)
  const addConversation = useAppStore((s) => s.addConversation)
  const setCurrentConversation = useAppStore((s) => s.setCurrentConversation)

  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'single' | 'group'>('single')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  // 单聊只保留一个 agent，群聊可多选
  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      if (mode === 'single') return prev.includes(id) ? [] : [id]
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    })
  }

  const switchMode = (m: 'single' | 'group') => {
    setMode(m)
    if (m === 'single') setSelectedIds((prev) => prev.slice(0, 1))
  }

  const canCreate = selectedIds.length > 0 && !creating

  const handleCreate = async () => {
    if (!canCreate) return
    setCreating(true)
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || (mode === 'group' ? '新群聊' : '新对话'),
          mode,
          agentIds: selectedIds,
        }),
      })
      if (res.ok) {
        const conv = await res.json()
        addConversation(conv)
        setCurrentConversation(conv.id)
        onClose()
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">新建对话</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent" title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="对话标题（可选）"
          className="mb-4 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />

        <div className="mb-4 flex gap-2">
          {(['single', 'group'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={cn(
                'flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors',
                mode === m ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
              )}
            >
              {m === 'single' ? '单聊' : '群聊'}
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs text-muted-foreground">
          {mode === 'single' ? '选择一个 Agent' : '选择多个 Agent'}
        </p>
        <div className="mb-4 max-h-60 space-y-1 overflow-y-auto">
          {agents.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">暂无 Agent</p>
          )}
          {agents.map((a) => {
            const selected = selectedIds.includes(a.id)
            return (
              <button
                key={a.id}
                onClick={() => toggleAgent(a.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  selected ? 'border-primary bg-primary/10' : 'hover:bg-accent'
                )}
              >
                <span className="text-lg">{a.avatar}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                </span>
                {selected && <span className="shrink-0 text-xs text-primary">✓</span>}
              </button>
            )
          })}
        </div>

        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          创建
        </button>
      </div>
    </div>
  )
}
