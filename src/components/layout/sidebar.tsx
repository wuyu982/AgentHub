'use client'

import { useAppStore } from '@/stores/app-store'
import { Plus, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const conversations = useAppStore((s) => s.conversations)
  const currentId = useAppStore((s) => s.currentConversationId)
  const setCurrentConversation = useAppStore((s) => s.setCurrentConversation)
  const addConversation = useAppStore((s) => s.addConversation)

  const handleNew = async () => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新对话' }),
    })
    if (res.ok) {
      const conv = await res.json()
      addConversation(conv)
      setCurrentConversation(conv.id)
    }
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">AgentHub</h1>
        <button
          onClick={handleNew}
          className="rounded-md p-1.5 hover:bg-accent"
          title="新建对话"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* 会话列表 */}
      <nav className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            暂无对话
          </p>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => setCurrentConversation(conv.id)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
              currentId === conv.id
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-accent/50'
            )}
          >
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{conv.title}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
