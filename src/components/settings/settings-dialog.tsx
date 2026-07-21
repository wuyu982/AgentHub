'use client'

import { useState, useEffect } from 'react'
import { X, KeyRound, Loader2 } from 'lucide-react'

interface SettingsDialogProps {
  onClose: () => void
}

// 全局设置：Embedding / Rerank 凭证（RAG 用）。对话 LLM 凭证由「模型」界面管，此处不涉及。
export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 非敏感字段回显；apiKey 只有 has* 标记（明文不出服务端），输入框留空 = 不修改
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState('')
  const [embeddingModel, setEmbeddingModel] = useState('')
  const [embeddingKey, setEmbeddingKey] = useState('')
  const [embeddingKeySet, setEmbeddingKeySet] = useState(false)
  const [rerankBaseUrl, setRerankBaseUrl] = useState('')
  const [rerankModel, setRerankModel] = useState('')
  const [rerankKey, setRerankKey] = useState('')
  const [rerankKeySet, setRerankKeySet] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s: Record<string, string | boolean>) => {
        setEmbeddingBaseUrl((s.embedding_base_url as string) ?? '')
        setEmbeddingModel((s.embedding_model as string) ?? '')
        setEmbeddingKeySet(!!s.embedding_api_key__set)
        setRerankBaseUrl((s.rerank_base_url as string) ?? '')
        setRerankModel((s.rerank_model as string) ?? '')
        setRerankKeySet(!!s.rerank_api_key__set)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      // 非敏感字段照写；apiKey 仅在用户输入了新值时才带上（留空 = 后端跳过不覆盖）
      const body: Record<string, string> = {
        embedding_base_url: embeddingBaseUrl.trim(),
        embedding_model: embeddingModel.trim(),
        rerank_base_url: rerankBaseUrl.trim(),
        rerank_model: rerankModel.trim(),
      }
      if (embeddingKey.trim()) body.embedding_api_key = embeddingKey.trim()
      if (rerankKey.trim()) body.rerank_api_key = rerankKey.trim()

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSaved(true)
        // 更新 has* 标记，输入框清空（避免明文残留在内存）
        if (embeddingKey.trim()) setEmbeddingKeySet(true)
        if (rerankKey.trim()) setRerankKeySet(true)
        setEmbeddingKey('')
        setRerankKey('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">全局设置</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent" title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : (
          <div className="space-y-6 overflow-y-auto px-5 py-4">
            <p className="text-xs text-muted-foreground">
              Embedding 与 Rerank 凭证用于 RAG 知识库。对话模型的凭证请在左侧「模型」中配置。
            </p>

            <CredGroup
              title="Embedding（文档向量化）"
              baseUrl={embeddingBaseUrl}
              onBaseUrl={setEmbeddingBaseUrl}
              baseUrlPlaceholder="https://api.openai.com/v1"
              model={embeddingModel}
              onModel={setEmbeddingModel}
              modelPlaceholder="text-embedding-3-small"
              apiKey={embeddingKey}
              onApiKey={setEmbeddingKey}
              keySet={embeddingKeySet}
            />

            <CredGroup
              title="Rerank（检索精排，可选）"
              baseUrl={rerankBaseUrl}
              onBaseUrl={setRerankBaseUrl}
              baseUrlPlaceholder="https://api.siliconflow.cn/v1"
              model={rerankModel}
              onModel={setRerankModel}
              modelPlaceholder="BAAI/bge-reranker-v2-m3"
              apiKey={rerankKey}
              onApiKey={setRerankKey}
              keySet={rerankKeySet}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t px-5 py-4">
          {saved && <span className="text-xs text-green-600">已保存</span>}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 一组凭证（baseUrl + model + apiKey）；apiKey 用 password 输入，占位符提示是否已配置
function CredGroup({
  title,
  baseUrl,
  onBaseUrl,
  baseUrlPlaceholder,
  model,
  onModel,
  modelPlaceholder,
  apiKey,
  onApiKey,
  keySet,
}: {
  title: string
  baseUrl: string
  onBaseUrl: (v: string) => void
  baseUrlPlaceholder: string
  model: string
  onModel: (v: string) => void
  modelPlaceholder: string
  apiKey: string
  onApiKey: (v: string) => void
  keySet: boolean
}) {
  const inputCls =
    'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring'

  return (
    <div className="space-y-2.5">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Base URL</label>
        <input value={baseUrl} onChange={(e) => onBaseUrl(e.target.value)} placeholder={baseUrlPlaceholder} className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Model</label>
        <input value={model} onChange={(e) => onModel(e.target.value)} placeholder={modelPlaceholder} className={inputCls} />
      </div>
      <div className="space-y-1">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <KeyRound className="h-3 w-3" />
          API Key
          {keySet && <span className="text-green-600">· 已配置</span>}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKey(e.target.value)}
          placeholder={keySet ? '已配置（留空则不修改）' : '未配置，请输入 API Key'}
          className={inputCls}
          autoComplete="off"
        />
      </div>
    </div>
  )
}
