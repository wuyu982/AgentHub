'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { useAppStore } from '@/stores/app-store'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentRecord, ConversationRecord } from '@/shared/types'

interface ChatInputProps {
  conversationId: string
}

// 从行首或空格后的 @ 触发；捕获 @ 后到光标处的查询词（不含空格）
const MENTION_RE = /(?:^|\s)@([^\s@]*)$/

export function ChatInput({ conversationId }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const addMessage = useAppStore((s) => s.addMessage)
  const agents = useAppStore((s) => s.agents)
  const conversations = useAppStore((s) => s.conversations)

  // 当前会话内的 agent（@ 只能提及会话内成员）
  const convAgents = useMemo(() => {
    const conv = conversations.find((c: ConversationRecord) => c.id === conversationId)
    if (!conv) return [] as AgentRecord[]
    const ids = new Set(conv.agentIds)
    return agents.filter((a: AgentRecord) => ids.has(a.id))
  }, [conversations, conversationId, agents])

  const matches = useMemo(() => {
    if (!menuOpen) return [] as AgentRecord[]
    const q = query.toLowerCase()
    return convAgents.filter((a) => a.name.toLowerCase().includes(q))
  }, [menuOpen, query, convAgents])

  // 每次输入后，根据光标前文本判断是否处于 @ 提及态
  const syncMention = useCallback((value: string, caret: number) => {
    const before = value.slice(0, caret)
    const m = before.match(MENTION_RE)
    if (m && convAgents.length > 0) {
      setMenuOpen(true)
      setQuery(m[1])
      setActiveIndex(0)
    } else {
      setMenuOpen(false)
    }
  }, [convAgents.length])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    syncMention(value, e.target.selectionStart ?? value.length)
  }

  // 选中某个 agent：把光标前的 @query 替换成 @名字 + 空格
  const pickAgent = useCallback((agent: AgentRecord) => {
    const el = textareaRef.current
    const caret = el?.selectionStart ?? input.length
    const before = input.slice(0, caret)
    const after = input.slice(caret)
    const replaced = before.replace(MENTION_RE, (full) => {
      // 保留 @ 前的空白（若有）
      const lead = full.startsWith('@') ? '' : full[0]
      return `${lead}@${agent.name} `
    })
    const next = replaced + after
    setInput(next)
    setMenuOpen(false)
    // 光标移到插入的名字之后
    requestAnimationFrame(() => {
      el?.focus()
      const pos = replaced.length
      el?.setSelectionRange(pos, pos)
    })
  }, [input])

  // 提交时从最终文本反推 mentionedAgentIds（删掉 @名字 即自动取消提及）
  const resolveMentions = useCallback((text: string): string[] => {
    const ids: string[] = []
    for (const a of convAgents) {
      const re = new RegExp(`(?:^|\\s)@${escapeRegExp(a.name)}(?=\\s|$)`)
      if (re.test(text)) ids.push(a.id)
    }
    return ids
  }, [convAgents])

  const handleSubmit = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    const mentionedAgentIds = resolveMentions(text)

    setSending(true)
    setInput('')
    setMenuOpen(false)

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, mentionedAgentIds }),
      })

      if (res.ok) {
        const msg = await res.json()
        addMessage(conversationId, msg)
      }
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [input, sending, conversationId, addMessage, resolveMentions])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 下拉打开时，方向键/Enter/Esc 归菜单操作
    if (menuOpen && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pickAgent(matches[activeIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuOpen(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t p-4">
      <div className="relative mx-auto flex max-w-3xl items-end gap-2">
        {menuOpen && matches.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 max-h-56 w-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
            {matches.map((agent, i) => (
              <button
                key={agent.id}
                type="button"
                // mousedown 先于 textarea 的 blur，避免点击丢失
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickAgent(agent)
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                )}
              >
                <span className="shrink-0">{agent.avatar}</span>
                <span className="truncate">{agent.name}</span>
                {agent.description && (
                  <span className="truncate text-xs text-muted-foreground">
                    {agent.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (@ 提及 Agent, Enter 发送, Shift+Enter 换行)"
          rows={1}
          className="flex-1 resize-none rounded-lg border bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          disabled={sending}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || sending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
