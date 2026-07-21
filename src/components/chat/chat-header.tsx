'use client'

import { useAppStore } from '@/stores/app-store'
import { AgentAvatars } from '@/components/chat/agent-avatars'
import { cn } from '@/lib/utils'
import { Users, User } from 'lucide-react'

// 会话顶部栏：标题 + 成员头像堆叠 + SSE 连接状态
export function ChatHeader({ conversationId }: { conversationId: string }) {
  const conv = useAppStore((s) => s.conversations.find((c) => c.id === conversationId))
  const agents = useAppStore((s) => s.agents)
  const connected = useAppStore((s) => s.connected)

  if (!conv) return null

  const members = agents.filter((a) => conv.agentIds.includes(a.id))
  const isGroup = conv.mode === 'group'

  return (
    <header className="flex items-center gap-3 border-b bg-card/50 px-4 py-2.5 backdrop-blur">
      {members.length > 0 && <AgentAvatars agents={members} size={28} max={4} className="shrink-0" />}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold leading-tight">{conv.title}</h2>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {isGroup ? (
            <>
              <Users className="h-3 w-3" />
              <span>{members.length} 个成员</span>
            </>
          ) : (
            <>
              <User className="h-3 w-3" />
              <span className="truncate">{members[0]?.name ?? '单聊'}</span>
            </>
          )}
        </div>
      </div>

      {/* 连接状态指示灯 */}
      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={cn(
            'h-2 w-2 rounded-full transition-colors',
            connected ? 'bg-green-500' : 'bg-muted-foreground/40'
          )}
        />
        <span>{connected ? '已连接' : '未连接'}</span>
      </div>
    </header>
  )
}
