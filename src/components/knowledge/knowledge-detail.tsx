'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Upload, FileText, Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KnowledgeBaseRecord, DocumentRecord } from '@/shared/types'

interface KnowledgeDetailProps {
  kb: KnowledgeBaseRecord
}

interface SearchHit {
  content: string
  score: number
  documentId: string
  knowledgeBaseId: string
}

const STATUS_LABEL: Record<DocumentRecord['status'], string> = {
  pending: '等待中',
  processing: '处理中',
  ready: '就绪',
  failed: '失败',
}

const STATUS_STYLE: Record<DocumentRecord['status'], string> = {
  pending: 'text-muted-foreground',
  processing: 'text-blue-500',
  ready: 'text-green-600',
  failed: 'text-destructive',
}

// 选中知识库的详情：上半文档管理（上传/状态），下半检索测试。
export function KnowledgeDetail({ kb }: KnowledgeDetailProps) {
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  const loadDocs = useCallback(async () => {
    const res = await fetch(`/api/knowledge/${kb.id}/documents`)
    if (res.ok) setDocs(await res.json())
  }, [kb.id])

  useEffect(() => {
    setHits(null)
    setQuery('')
    loadDocs()
  }, [loadDocs])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/knowledge/${kb.id}/documents`, { method: 'POST', body: form })
      if (res.ok) {
        await loadDocs()
      } else {
        const err = await res.json()
        alert(`上传失败：${err.error ?? res.statusText}`)
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSearch = async () => {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setHits(null)
    try {
      const res = await fetch(`/api/knowledge/${kb.id}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (res.ok) {
        const data = await res.json()
        setHits(data.hits)
      } else {
        const err = await res.json()
        alert(`检索失败：${err.error ?? res.statusText}`)
      }
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 头部 */}
      <div className="border-b px-5 py-3">
        <h2 className="text-base font-semibold">{kb.name}</h2>
        {kb.description && <p className="text-sm text-muted-foreground">{kb.description}</p>}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {/* 文档管理 */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">文档</h3>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? '处理中…' : '上传文档'}
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
          </div>

          <div className="space-y-1">
            {docs.length === 0 && (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                还没有文档，上传一个开始
              </p>
            )}
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{doc.filename}</span>
                {doc.status === 'ready' && (
                  <span className="shrink-0 text-xs text-muted-foreground">{doc.chunkCount} 块</span>
                )}
                <span className={cn('shrink-0 text-xs font-medium', STATUS_STYLE[doc.status])}>
                  {STATUS_LABEL[doc.status]}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 检索测试 */}
        <section>
          <h3 className="mb-2 text-sm font-medium">检索测试</h3>
          <div className="flex gap-1.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="输入问题，测试知识库召回效果"
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleSearch}
              disabled={!query.trim() || searching}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              检索
            </button>
          </div>

          {hits && (
            <div className="mt-3 space-y-2">
              {hits.length === 0 && <p className="text-sm text-muted-foreground">未检索到相关内容</p>}
              {hits.map((h, i) => (
                <div key={i} className="rounded-md border p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>#{i + 1}</span>
                    <span>score {h.score.toFixed(4)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-foreground/90">{h.content}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
