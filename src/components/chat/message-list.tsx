'use client'

import type { MessageRecord, MessagePart } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'
import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { agentAccent } from '@/lib/agent-accent'
import { MarkdownContent } from '@/components/chat/markdown-content'
import { Wrench, Check, AlertTriangle } from 'lucide-react'

interface MessageListProps {
  messages: MessageRecord[]
}

export function MessageList({ messages }: MessageListProps) {
  const agents = useAppStore((s) => s.agents)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.parts])

  const getAgent = (agentId: string | null) =>
    agentId ? agents.find((a) => a.id === agentId) ?? null : null

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-5">
        {messages.map((msg) => {
          const isUser = msg.role === 'user'
          const agent = getAgent(msg.agentId)
          const accent = agentAccent(msg.agentId)

          return (
            <div
              key={msg.id}
              className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}
            >
              {/* 头像 */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                style={
                  isUser
                    ? undefined
                    : { backgroundColor: accent.soft, border: `1px solid ${accent.border}` }
                }
              >
                {isUser ? (
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-primary text-primary-foreground">
                    你
                  </span>
                ) : (
                  <span>{agent?.avatar ?? '🤖'}</span>
                )}
              </div>

              {/* 内容列 */}
              <div className={cn('flex min-w-0 flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
                {/* 发送者 + 时间 */}
                <div className="flex items-center gap-2 px-1 text-xs">
                  {!isUser && (
                    <span className="font-medium" style={{ color: accent.text }}>
                      {agent?.name ?? 'Agent'}
                    </span>
                  )}
                  <span className="text-muted-foreground">{fmtTime(msg.createdAt)}</span>
                </div>

                {/* 气泡 */}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                    isUser
                      ? 'rounded-tr-sm bg-primary text-primary-foreground'
                      : 'rounded-tl-sm bg-muted',
                  )}
                  style={isUser ? undefined : { borderLeft: `3px solid ${accent.border}` }}
                >
                  {msg.parts.map((part, i) => (
                    <PartView key={i} part={part} isUser={isUser} />
                  ))}

                  {/* 流式光标 */}
                  {msg.status === 'streaming' && (
                    <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-current opacity-60" />
                  )}
                  {msg.status === 'error' && (
                    <p className="mt-1 text-xs text-destructive">⚠ 响应出错</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function PartView({ part, isUser }: { part: MessagePart; isUser: boolean }) {
  if (part.type === 'text') {
    return isUser ? (
      <p className="whitespace-pre-wrap">{part.content}</p>
    ) : (
      <MarkdownContent content={part.content} />
    )
  }
  if (part.type === 'thinking') {
    return (
      <details className="my-1 text-xs opacity-60">
        <summary className="cursor-pointer">思考过程</summary>
        <p className="mt-1 whitespace-pre-wrap">{part.content}</p>
      </details>
    )
  }
  if (part.type === 'tool_use') {
    return (
      <details className="my-1.5 rounded-lg border border-border/60 bg-background/50 text-xs">
        <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-medium">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          调用工具 <span className="font-mono">{part.toolName}</span>
        </summary>
        <pre className="overflow-x-auto border-t px-2.5 py-1.5 text-muted-foreground">
          {JSON.stringify(part.args, null, 2)}
        </pre>
      </details>
    )
  }
  if (part.type === 'tool_result') {
    return (
      <details className="my-1.5 rounded-lg border border-border/60 bg-background/50 text-xs">
        <summary
          className={cn(
            'flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-medium',
            part.isError && 'text-destructive',
          )}
        >
          {part.isError ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
          {part.isError ? '工具出错' : '工具结果'}
        </summary>
        <pre className="overflow-x-auto border-t px-2.5 py-1.5 text-muted-foreground">
          {typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2)}
        </pre>
      </details>
    )
  }
  return null
}
