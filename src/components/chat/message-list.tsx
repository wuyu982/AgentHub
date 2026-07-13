'use client'

import type { MessageRecord } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'
import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface MessageListProps {
  messages: MessageRecord[]
}

export function MessageList({ messages }: MessageListProps) {
  const agents = useAppStore((s) => s.agents)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.parts])

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return null
    const agent = agents.find((a) => a.id === agentId)
    return agent ? `${agent.avatar} ${agent.name}` : agentId
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex flex-col gap-1',
              msg.role === 'user' ? 'items-end' : 'items-start'
            )}
          >
            {/* 发送者标签 */}
            {msg.role === 'agent' && (
              <span className="text-xs text-muted-foreground">
                {getAgentName(msg.agentId)}
              </span>
            )}

            {/* 消息气泡 */}
            <div
              className={cn(
                'max-w-[80%] rounded-lg px-4 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted',
                msg.status === 'streaming' && 'animate-pulse'
              )}
            >
              {msg.parts.map((part, i) => {
                if (part.type === 'text') {
                  return (
                    <p key={i} className="whitespace-pre-wrap">
                      {part.content}
                    </p>
                  )
                }
                if (part.type === 'thinking') {
                  return (
                    <details key={i} className="text-xs opacity-60">
                      <summary>思考过程</summary>
                      <p className="whitespace-pre-wrap">{part.content}</p>
                    </details>
                  )
                }
                return null
              })}
              {msg.status === 'error' && (
                <p className="mt-1 text-xs text-destructive">⚠ 响应出错</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
