'use client'

import type { MessageRecord, MessagePart, AgentRecord } from '@/shared/types'
import { useAppStore } from '@/stores/app-store'
import { memo, useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { agentAccent } from '@/lib/agent-accent'
import { MarkdownContent } from '@/components/chat/markdown-content'
import { ArtifactCard } from '@/components/chat/artifact-card'
import { Wrench, Check, AlertTriangle } from 'lucide-react'

interface MessageListProps {
  messages: MessageRecord[]
}

// 距底多少 px 内视为「贴着底部」，此时新消息自动滚动跟随；用户上翻超出则不打扰
const NEAR_BOTTOM_PX = 120

export function MessageList({ messages }: MessageListProps) {
  const agents = useAppStore((s) => s.agents)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  // 是否贴底：贴底才自动跟随流式；用户主动上翻则暂停跟随，避免被强行拉回
  const atBottomRef = useRef(true)
  const lastMessageParts = messages.at(-1)?.parts

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }

  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, lastMessageParts])

  const getAgent = (agentId: string | null) =>
    agentId ? agents.find((a) => a.id === agentId) ?? null : null

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-5">
        {messages.map((msg, i) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            agent={getAgent(msg.agentId)}
            // 仅最后一条（新到达的）播放进入动画，历史消息不重放
            animate={i === messages.length - 1}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

// memo：只有 msg 引用变化的那条消息重渲染（Immer 保证未变的消息保持同引用），
// 流式期间历史消息整行跳过，不再全量重解析 markdown
const MessageRow = memo(function MessageRow({
  msg,
  agent,
  animate,
}: {
  msg: MessageRecord
  agent: AgentRecord | null
  animate?: boolean
}) {
  const isUser = msg.role === 'user'
  const accent = agentAccent(msg.agentId)

  return (
    <div className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row', animate && 'animate-message-in')}>
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
            <PartView
              key={i}
              part={part}
              isUser={isUser}
              // 思考仍在进行：该 thinking 是最后一个 part 且消息未收束（正文一接上就自动折叠）
              isThinking={
                part.type === 'thinking' &&
                msg.status === 'streaming' &&
                i === msg.parts.length - 1
              }
            />
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
})

function PartView({ part, isUser, isThinking }: { part: MessagePart; isUser: boolean; isThinking?: boolean }) {
  if (part.type === 'text') {
    return isUser ? (
      <p className="whitespace-pre-wrap">{part.content}</p>
    ) : (
      <MarkdownContent content={part.content} />
    )
  }
  if (part.type === 'thinking') {
    return <ThinkingPart content={part.content} active={!!isThinking} />
  }
  if (part.type === 'tool_use') {
    return <ToolUsePart callId={part.callId} toolName={part.toolName} args={part.args} />
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
  if (part.type === 'artifact_ref') {
    return <ArtifactCard artifactId={part.artifactId} />
  }
  return null
}

// 工具调用卡片；若该 callId 处于待审批态，卡片内嵌批准/拒绝按钮（human-in-the-loop）
function ToolUsePart({ callId, toolName, args }: { callId: string; toolName: string; args: unknown }) {
  const approval = useAppStore((s) => s.pendingApprovals[callId])
  const clearApproval = useAppStore((s) => s.clearApproval)
  const [submitting, setSubmitting] = useState(false)

  const decide = async (approved: boolean) => {
    setSubmitting(true)
    try {
      await fetch(`/api/approvals/${callId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })
    } catch {
      // 网络失败不阻塞：本地清掉待审态，后端超时会兜底按拒绝处理
    } finally {
      clearApproval(callId)
      setSubmitting(false)
    }
  }

  return (
    <div className="my-1.5 rounded-lg border border-border/60 bg-background/50 text-xs">
      <details>
        <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-medium">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          调用工具 <span className="font-mono">{toolName}</span>
        </summary>
        <pre className="overflow-x-auto border-t px-2.5 py-1.5 text-muted-foreground">
          {JSON.stringify(args, null, 2)}
        </pre>
      </details>

      {approval && (
        <div className="flex items-center justify-between gap-2 border-t border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate text-amber-700 dark:text-amber-400">
            ⚠ 等待确认：{approval.summary}
          </span>
          <div className="flex shrink-0 gap-1.5">
            <button
              disabled={submitting}
              onClick={() => decide(true)}
              className="rounded-md bg-green-600 px-2.5 py-1 font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              批准
            </button>
            <button
              disabled={submitting}
              onClick={() => decide(false)}
              className="rounded-md bg-muted px-2.5 py-1 font-medium hover:bg-muted-foreground/20 disabled:opacity-50"
            >
              拒绝
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// 思考进行时默认展开、结束时自动折叠；折叠后用户仍可手动点开回看
function ThinkingPart({ content, active }: { content: string; active: boolean }) {
  const [open, setOpen] = useState(active)
  // active 翻转时同步一次（true→展开、false→折叠），此后交回用户手动控制
  useEffect(() => setOpen(active), [active])

  return (
    <details
      className="my-1 text-xs opacity-60"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer">{active ? '思考中…' : '思考过程'}</summary>
      <p className="mt-1 whitespace-pre-wrap">{content}</p>
    </details>
  )
}
