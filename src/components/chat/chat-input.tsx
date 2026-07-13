'use client'

import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/app-store'
import { Send } from 'lucide-react'

interface ChatInputProps {
  conversationId: string
}

export function ChatInput({ conversationId }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const addMessage = useAppStore((s) => s.addMessage)

  const handleSubmit = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setInput('')

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })

      if (res.ok) {
        const msg = await res.json()
        addMessage(conversationId, msg)
      }
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [input, sending, conversationId, addMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
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
