'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'
import type { AgentRecord, KnowledgeBaseRecord, ModelConfigView } from '@/shared/types'

interface ToolMeta {
  name: string
  description: string
}

interface AgentDetailProps {
  agent: AgentRecord
  tools: ToolMeta[]
  knowledgeBases: KnowledgeBaseRecord[]
  modelConfigs: ModelConfigView[]
}

// 从 AgentRecord 抽出表单可编辑字段，其余（id/isBuiltin 等）不进表单态
type FormState = Pick<
  AgentRecord,
  'name' | 'avatar' | 'description' | 'systemPrompt' | 'modelConfigId' | 'toolNames' | 'knowledgeBaseIds'
>

function toForm(a: AgentRecord): FormState {
  return {
    name: a.name,
    avatar: a.avatar,
    description: a.description,
    systemPrompt: a.systemPrompt,
    modelConfigId: a.modelConfigId,
    toolNames: a.toolNames,
    knowledgeBaseIds: a.knowledgeBaseIds,
  }
}

const INPUT_CLS = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring'
const LABEL_CLS = 'mb-1.5 block text-sm font-medium'

// 选中 Agent 的编辑表单：身份 / 提示词 / 模型 / 能力，保存后 PUT 并 upsert 到 store。
export function AgentDetail({ agent, tools, knowledgeBases, modelConfigs }: AgentDetailProps) {
  const upsertAgent = useAppStore((s) => s.upsertAgent)
  const [form, setForm] = useState<FormState>(() => toForm(agent))
  const [saving, setSaving] = useState(false)

  // 切换选中 Agent 时重置表单
  useEffect(() => {
    setForm(toForm(agent))
  }, [agent])

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const toggleInArray = (key: 'toolNames' | 'knowledgeBaseIds', value: string) =>
    setForm((prev) => {
      const arr = prev[key]
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] }
    })

  const handleSave = async () => {
    if (saving || !form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        upsertAgent((await res.json()) as AgentRecord)
      } else {
        const err = await res.json()
        alert(`保存失败：${err.error ?? res.statusText}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{form.avatar}</span>
          <h2 className="text-base font-semibold">{form.name || '未命名 Agent'}</h2>
          {agent.isBuiltin && (
            <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              内置
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          保存
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {/* 身份 */}
        <section className="grid grid-cols-[5rem_1fr] gap-3">
          <div>
            <label className={LABEL_CLS}>图标</label>
            <input
              value={form.avatar}
              onChange={(e) => patch('avatar', e.target.value)}
              className={cn(INPUT_CLS, 'text-center text-lg')}
              maxLength={4}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>名称</label>
            <input value={form.name} onChange={(e) => patch('name', e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="col-span-2">
            <label className={LABEL_CLS}>描述</label>
            <input
              value={form.description}
              onChange={(e) => patch('description', e.target.value)}
              placeholder="一句话说明这个 Agent 擅长什么"
              className={INPUT_CLS}
            />
          </div>
        </section>

        {/* 系统提示词 */}
        <section>
          <label className={LABEL_CLS}>系统提示词</label>
          <textarea
            value={form.systemPrompt}
            onChange={(e) => patch('systemPrompt', e.target.value)}
            rows={6}
            className={cn(INPUT_CLS, 'resize-y font-mono text-xs leading-relaxed')}
          />
        </section>

        {/* 模型：引用「模型」页配置好的一条，不在此逐项填写 */}
        <section>
          <label className={LABEL_CLS}>模型配置</label>
          <select
            value={form.modelConfigId ?? ''}
            onChange={(e) => patch('modelConfigId', e.target.value || null)}
            className={INPUT_CLS}
          >
            <option value="">（使用默认配置）</option>
            {modelConfigs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.modelId ? ` · ${c.modelId}` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            在左侧「模型」页管理可用配置；此处只需选择。
          </p>
        </section>

        {/* 能力：工具 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">工具</h3>
          {tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有已注册的工具</p>
          ) : (
            <div className="space-y-1">
              {tools.map((t) => (
                <label
                  key={t.name}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
                >
                  <input
                    type="checkbox"
                    checked={form.toolNames.includes(t.name)}
                    onChange={() => toggleInArray('toolNames', t.name)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* 能力：知识库 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">可检索知识库</h3>
          {knowledgeBases.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有知识库</p>
          ) : (
            <div className="space-y-1">
              {knowledgeBases.map((kb) => (
                <label
                  key={kb.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
                >
                  <input
                    type="checkbox"
                    checked={form.knowledgeBaseIds.includes(kb.id)}
                    onChange={() => toggleInArray('knowledgeBaseIds', kb.id)}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{kb.name}</span>
                </label>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
