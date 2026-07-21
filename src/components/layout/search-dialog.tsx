'use client'

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/app-store'
import { Search, X, MessageSquare, Loader2 } from 'lucide-react'
import type { SearchResult } from '@/app/api/search/route'

interface SearchDialogProps {
  onClose: () => void
}

const DEBOUNCE_MS = 220

export function SearchDialog({ onClose }: SearchDialogProps) {
  const setCurrentConversation = useAppStore((s) => s.setCurrentConversation)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult>({ conversations: [], messages: [] })
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // debounce：输入停顿后再查，避免每字打一次后端
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResult({ conversations: [], messages: [] })
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      const ctrl = new AbortController()
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data: SearchResult) => setResult(data))
        .catch(() => {})
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const goTo = (conversationId: string) => {
    setCurrentConversation(conversationId)
    onClose()
  }

  const hasResults = result.conversations.length > 0 || result.messages.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索框 */}
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="搜索会话与消息…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent" title="关闭 (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 结果 */}
        <div className="overflow-y-auto">
          {!query.trim() && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">输入关键词搜索</p>
          )}
          {query.trim() && !loading && !hasResults && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">未找到匹配结果</p>
          )}

          {result.conversations.length > 0 && (
            <div className="p-2">
              <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">会话</p>
              {result.conversations.map((c) => (
                <button
                  key={c.conversationId}
                  onClick={() => goTo(c.conversationId)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{highlight(c.title, query.trim())}</span>
                </button>
              ))}
            </div>
          )}

          {result.messages.length > 0 && (
            <div className="border-t p-2">
              <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">消息</p>
              {result.messages.map((m) => (
                <button
                  key={m.messageId}
                  onClick={() => goTo(m.conversationId)}
                  className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-accent"
                >
                  <span className="truncate text-xs text-muted-foreground">
                    {m.conversationTitle} · {m.role === 'user' ? '你' : 'Agent'}
                  </span>
                  <span className="line-clamp-2 text-sm">{highlight(m.snippet, query.trim())}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 把命中词包成 <mark>（大小写不敏感），其余原样
function highlight(text: string, q: string) {
  if (!q) return text
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  const parts: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    const idx = lower.indexOf(ql, i)
    if (idx === -1) {
      parts.push(text.slice(i))
      break
    }
    if (idx > i) parts.push(text.slice(i, idx))
    parts.push(
      <mark key={key++} className="rounded bg-yellow-200 text-inherit dark:bg-yellow-500/40">
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    i = idx + q.length
  }
  return parts
}
