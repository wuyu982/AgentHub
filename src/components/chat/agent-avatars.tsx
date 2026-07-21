'use client'

import type { AgentRecord } from '@/shared/types'
import { agentAccent } from '@/lib/agent-accent'
import { cn } from '@/lib/utils'

// 成员头像堆叠：sidebar 会话项与顶部栏共用。多于 max 个折叠为 +N。
export function AgentAvatars({
  agents,
  size = 20,
  max = 3,
  className,
}: {
  agents: AgentRecord[]
  size?: number
  max?: number
  className?: string
}) {
  const shown = agents.slice(0, max)
  const overflow = agents.length - shown.length

  return (
    <div className={cn('flex items-center', className)}>
      {shown.map((agent, i) => {
        const accent = agentAccent(agent.id)
        return (
          <span
            key={agent.id}
            className="flex shrink-0 items-center justify-center rounded-full ring-1 ring-card"
            style={{
              width: size,
              height: size,
              fontSize: size * 0.55,
              backgroundColor: accent.soft,
              border: `1px solid ${accent.border}`,
              marginLeft: i === 0 ? 0 : -size * 0.3, // 负 margin 制造堆叠
              zIndex: shown.length - i,
            }}
            title={agent.name}
          >
            {agent.avatar}
          </span>
        )
      })}
      {overflow > 0 && (
        <span
          className="flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-card"
          style={{
            width: size,
            height: size,
            fontSize: size * 0.45,
            marginLeft: -size * 0.3,
          }}
          title={`还有 ${overflow} 个成员`}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
