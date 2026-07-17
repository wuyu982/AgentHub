'use client'

import { useEffect, useState, useCallback } from 'react'
import { Cpu, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelConfigView } from '@/shared/types'
import { ModelConfigDetail } from '@/components/model-configs/model-config-detail'

// 模型配置管理主视图：左列配置列表（建/删），右侧选中配置的编辑表单。
// 数据仅此视图使用，不进全局 store（YAGNI）；Agent 通过下拉引用这些配置。
export function ModelConfigsPanel() {
  const [configs, setConfigs] = useState<ModelConfigView[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const loadConfigs = useCallback(async () => {
    const res = await fetch('/api/model-configs')
    if (res.ok) setConfigs(await res.json())
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  const handleCreate = async () => {
    if (creating) return
    // 空名时用默认名，创建后可在右侧表单改名——+ 号始终可点，避免"点了没反应"
    const trimmed = name.trim() || '新模型配置'
    setCreating(true)
    try {
      const res = await fetch('/api/model-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        const config = (await res.json()) as ModelConfigView
        setConfigs((prev) => [...prev, config])
        setSelectedId(config.id)
        setName('')
      } else {
        const err = await res.json()
        alert(`创建失败：${err.error ?? res.statusText}`)
      }
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该模型配置？')) return
    const res = await fetch(`/api/model-configs/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setConfigs((prev) => prev.filter((c) => c.id !== id))
      if (selectedId === id) setSelectedId(null)
    } else {
      const err = await res.json()
      alert(`删除失败：${err.error ?? res.statusText}`)
    }
  }

  // 保存后同步列表：默认标记可能转移，整体以返回值为准并重拉一次
  const handleSaved = (updated: ModelConfigView) => {
    setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    if (updated.isDefault) loadConfigs()
  }

  const selected = configs.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 配置列表列 */}
      <div className="flex w-64 flex-col border-r">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">模型配置</span>
        </div>

        {/* 新建输入 */}
        <div className="flex gap-1.5 border-b p-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="新建配置名称"
            className="min-w-0 flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="shrink-0 rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            title="新建配置"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {configs.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">暂无模型配置</p>
          )}
          {configs.map((config) => (
            <div
              key={config.id}
              className={cn(
                'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                selectedId === config.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
            >
              <button onClick={() => setSelectedId(config.id)} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{config.name}</span>
                  {config.isDefault && (
                    <span className="shrink-0 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">默认</span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {config.modelId ?? config.adapterName}
                </span>
              </button>
              {!config.isDefault && (
                <button
                  onClick={() => handleDelete(config.id)}
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

      {/* 编辑表单 */}
      {selected ? (
        <ModelConfigDetail config={selected} onSaved={handleSaved} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Cpu className="h-12 w-12" />
          <p className="text-sm">选择或创建一个模型配置</p>
        </div>
      )}
    </div>
  )
}
