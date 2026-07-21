'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'
import { Plus, MessageSquare, Settings, Sparkles, Users, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewConversationDialog } from '@/components/layout/new-conversation-dialog'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { ThemeToggle } from '@/components/theme-toggle'
import { AgentAvatars } from '@/components/chat/agent-avatars'
import { SettingsDialog } from '@/components/settings/settings-dialog'
import { SearchDialog } from '@/components/layout/search-dialog'

export function Sidebar() {
  const conversations = useAppStore((s) => s.conversations)
  const currentId = useAppStore((s) => s.currentConversationId)
  const activeView = useAppStore((s) => s.activeView)
  const agents = useAppStore((s) => s.agents)
  const setCurrentConversation = useAppStore((s) => s.setCurrentConversation)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // 全局快捷键 Cmd/Ctrl+K 唤起搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <aside className="flex h-full w-70 flex-col border-r bg-card">
        {/* 品牌区 */}
        <div className="flex items-start gap-3 border-b px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold leading-tight">AgentHub</h1>
            <p className="truncate text-xs text-muted-foreground">多智能体协作工作台</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="设置"
            >
              <Settings className="h-4 w-4" />
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* 主导航区 */}
        <SidebarNav />

        <div className="border-t" />

        {/* 会话列表区 */}
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            会话
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSearchOpen(true)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="搜索 (Ctrl/Cmd+K)"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDialogOpen(true)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="新建对话"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">暂无对话</p>
          )}
          {conversations.map((conv) => {
            const active = activeView === 'chat' && currentId === conv.id
            const members = agents.filter((a) => conv.agentIds.includes(a.id))
            return (
              <button
                key={conv.id}
                onClick={() => setCurrentConversation(conv.id)}
                className={cn(
                  'group relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                )}
              >
                {/* 选中态左侧高亮竖条，与导航区视觉语言统一 */}
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity',
                    active ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {/* 成员头像堆叠：有成员显示头像，空会话回退到图标 */}
                {members.length > 0 ? (
                  <AgentAvatars agents={members} size={22} max={3} className="shrink-0" />
                ) : (
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{conv.title}</span>
                {/* 群聊标记：成员数徽标 */}
                {conv.mode === 'group' && (
                  <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {members.length}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </aside>
      {dialogOpen && <NewConversationDialog onClose={() => setDialogOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </>
  )
}
