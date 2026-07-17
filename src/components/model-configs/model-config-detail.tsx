'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelConfigView, AdapterName, ModelProvider } from '@/shared/types'

interface ModelConfigDetailProps {
  config: ModelConfigView
  onSaved: (config: ModelConfigView) => void
}

const ADAPTER_OPTIONS: AdapterName[] = ['openai-compatible', 'anthropic', 'mock']
const PROVIDER_OPTIONS: ModelProvider[] = ['openai', 'anthropic', 'deepseek', 'volcano-ark', 'openai-compatible']

// apiKey 不进 form：后端从不回传明文；key 框仅用于"输入新 key"，独立状态管理
type FormState = Pick<
  ModelConfigView,
  'name' | 'adapterName' | 'provider' | 'modelId' | 'baseURL' | 'isDefault'
>

function toForm(c: ModelConfigView): FormState {
  return {
    name: c.name,
    adapterName: c.adapterName,
    provider: c.provider,
    modelId: c.modelId,
    baseURL: c.baseURL,
    isDefault: c.isDefault,
  }
}

const INPUT_CLS = 'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring'
const LABEL_CLS = 'mb-1.5 block text-sm font-medium'

// 选中模型配置的编辑表单：适配器 / provider / modelId / baseURL / apiKey / 默认标记。
export function ModelConfigDetail({ config, onSaved }: ModelConfigDetailProps) {
  const [form, setForm] = useState<FormState>(() => toForm(config))
  const [newApiKey, setNewApiKey] = useState('') // 仅承载"要写入的新 key"，切换配置时清空
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(toForm(config))
    setNewApiKey('')
  }, [config])

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (saving || !form.name.trim()) return
    setSaving(true)
    try {
      // key 框留空则不提交 apiKey，后端据此保留原 key（不误清）
      const body = newApiKey.trim() ? { ...form, apiKey: newApiKey.trim() } : form
      const res = await fetch(`/api/model-configs/${config.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setNewApiKey('')
        onSaved((await res.json()) as ModelConfigView)
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
          <h2 className="text-base font-semibold">{form.name || '未命名配置'}</h2>
          {config.isDefault && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">默认</span>
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
        <div>
          <label className={LABEL_CLS}>配置名称</label>
          <input
            value={form.name}
            onChange={(e) => patch('name', e.target.value)}
            placeholder="如 DeepSeek 官方、本地 vLLM"
            className={INPUT_CLS}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>适配器</label>
            <select
              value={form.adapterName}
              onChange={(e) => patch('adapterName', e.target.value as AdapterName)}
              className={INPUT_CLS}
            >
              {ADAPTER_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Provider</label>
            <select
              value={form.provider ?? ''}
              onChange={(e) => patch('provider', (e.target.value || null) as ModelProvider | null)}
              className={INPUT_CLS}
            >
              <option value="">（默认）</option>
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Model ID</label>
            <input
              value={form.modelId ?? ''}
              onChange={(e) => patch('modelId', e.target.value || null)}
              placeholder="如 gpt-4o、deepseek-chat"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Base URL</label>
            <input
              value={form.baseURL ?? ''}
              onChange={(e) => patch('baseURL', e.target.value || null)}
              placeholder="留空用默认"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div>
          <label className={LABEL_CLS}>API Key</label>
          <input
            type="password"
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            placeholder={config.hasApiKey ? '已配置（留空保持不变，输入则覆盖）' : '留空则回退到环境变量'}
            className={INPUT_CLS}
            autoComplete="off"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {config.hasApiKey ? '出于安全，已保存的 Key 不回显；只有输入新值才会覆盖。' : '尚未配置 Key。'}
          </p>
        </div>

        <label
          className={cn(
            'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm',
            config.isDefault && 'opacity-60'
          )}
        >
          <input
            type="checkbox"
            checked={form.isDefault}
            disabled={config.isDefault}
            onChange={(e) => patch('isDefault', e.target.checked)}
          />
          <span>
            <span className="block font-medium">设为默认配置</span>
            <span className="block text-xs text-muted-foreground">Agent 未指定模型时使用此配置</span>
          </span>
        </label>
      </div>
    </div>
  )
}
