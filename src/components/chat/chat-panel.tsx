'use client'

import { useAppStore } from '@/stores/app-store'
import { MessageList } from '@/components/chat/message-list'
import { ChatInput } from '@/components/chat/chat-input'
import { MessageSquarePlus } from 'lucide-react'
import type { MessageRecord } from '@/shared/types'

// 稳定引用，避免 selector 每次返回新数组触发无限渲染
const EMPTY: MessageRecord[] = []

export function ChatPanel() {
  const currentId = useAppStore((s) => s.currentConversationId)
  const messages = useAppStore((s) =>
    currentId ? s.messages[currentId] : undefined
  ) ?? EMPTY

  if (!currentId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
        <MessageSquarePlus className="h-12 w-12" />
        <p>选择或创建一个对话开始</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <MessageList messages={messages} />
      <ChatInput conversationId={currentId} />
    </div>
  )
}
