'use client'

import { useAppStore } from '@/stores/app-store'
import { MessageList } from '@/components/chat/message-list'
import { ChatInput } from '@/components/chat/chat-input'
import { ChatHeader } from '@/components/chat/chat-header'
import { MessageSquarePlus, Sparkles } from 'lucide-react'
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
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
        {/* 渐变光晕 + 图标，呼应品牌区视觉 */}
        <div className="relative">
          <div className="absolute inset-0 -z-10 blur-2xl">
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary/40 to-violet-500/40" />
          </div>
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-lg">
            <Sparkles className="h-11 w-11" />
          </div>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">开启一场智能协作</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            从左侧选择已有对话，或新建一个对话，让多个 Agent 协同为你工作。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <ChatHeader conversationId={currentId} />
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <MessageSquarePlus className="h-10 w-10 opacity-60" />
          <p className="text-sm">发送第一条消息，开始对话</p>
        </div>
      ) : (
        <MessageList messages={messages} />
      )}
      <ChatInput conversationId={currentId} />
    </div>
  )
}
