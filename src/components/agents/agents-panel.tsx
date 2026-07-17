'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bot, Plus, Trash2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'
import type { AgentRecord, KnowledgeBaseRecord, ModelConfigView } from '@/shared/types'
import { AgentDetail } from '@/components/agents/agent-detail'

interface ToolMeta {
  name: string
  description: string
}

// Agent 管理主视图：左列 Agent 列表（建/删，内置带锁），右侧选中 Agent 的配置表单。
// agents 走全局 store（聊天选人共用）；工具/知识库列表仅本视图用，不进 store（YAGNI）。
export function AgentsPanel() {
  const agents = useAppStore((s) => s.agents)
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const removeAgent = useAppStore((s) => s.removeAgent)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [tools, setTools] = useState<ToolMeta[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseRecord[]>([])
  const [modelConfigs, setModelConfigs] = useState<ModelConfigView[]>([])

  // 拉配置表单需要的选项：可选工具 + 知识库 + 模型配置
  useEffect(() => {
    fetch('/api/tools').then(async (r) => {
      if (r.ok) setTools(await r.json())
    })
    fetch('/api/knowledge').then(async (r) => {
      if (r.ok) setKnowledgeBases(await r.json())
    })
    fetch('/api/model-configs').then(async (r) => {
      if (r.ok) setModelConfigs(await r.json())
    })
  }, [])

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        const agent = (await res.json()) as AgentRecord
        upsertAgent(agent)
        setSelectedId(agent.id)
        setName('')
      } else {
        const err = await res.json()
        alert(`创建失败：${err.error ?? res.statusText}`)
      }
    } finally {
      setCreating(false)
    }
  }, [name, creating, upsertAgent])

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该 Agent？此操作不可恢复。')) return
    const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    if (res.ok) {
      removeAgent(id)
      if (selectedId === id) setSelectedId(null)
    } else {
      const err = await res.json()
      alert(`删除失败：${err.error ?? res.statusText}`)
    }
  }

  const selected = agents.find((a) => a.id === selectedId) ?? null

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Agent 列表列 */}
      <div className="flex w-64 flex-col border-r">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">智能体</span>
        </div>

        {/* 新建输入 */}
        <div className="flex gap-1.5 border-b p-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="新建 Agent 名称"
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
          {agents.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">暂无 Agent</p>
          )}
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={cn(
                'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                selectedId === agent.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
            >
              <button onClick={() => setSelectedId(agent.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="shrink-0 text-base">{agent.avatar}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate font-medium">{agent.name}</span>
                    {agent.isBuiltin && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {modelConfigs.find((c) => c.id === agent.modelConfigId)?.name ?? '默认模型'}
                  </span>
                </span>
              </button>
              {!agent.isBuiltin && (
                <button
                  onClick={() => handleDelete(agent.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 配置表单 */}
      {selected ? (
        <AgentDetail agent={selected} tools={tools} knowledgeBases={knowledgeBases} modelConfigs={modelConfigs} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Bot className="h-12 w-12" />
          <p className="text-sm">选择或创建一个 Agent</p>
        </div>
      )}
    </div>
  )
}
