'use client'

import { useAppStore, type ActiveView } from '@/stores/app-store'
import { MessagesSquare, Bot, Activity } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS: { view: ActiveView; label: string; icon: LucideIcon }[] = [
  { view: 'chat', label: '对话', icon: MessagesSquare },
  { view: 'agents', label: '智能体', icon: Bot },
  { view: 'monitor', label: '模型流量监控', icon: Activity },
]

export function SidebarNav() {
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)

  return (
    <nav className="flex flex-col gap-0.5 p-2">
      {NAV_ITEMS.map(({ view, label, icon: Icon }) => {
        const active = activeView === view
        return (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={cn(
              'group relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            {/* 选中态左侧高亮竖条 */}
            <span
              className={cn(
                'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity',
                active ? 'opacity-100' : 'opacity-0'
              )}
            />
            <Icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
