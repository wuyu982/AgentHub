'use client'

import { useEffect } from 'react'
import { Bot, Activity } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { Sidebar } from '@/components/layout/sidebar'
import { PlaceholderView } from '@/components/layout/placeholder-view'
import { ChatPanel } from '@/components/chat/chat-panel'
import { SSE_RECONNECT_INTERVAL } from '@/shared/constants'

export function AppShell() {
  const setConversations = useAppStore((s) => s.setConversations)
  const setAgents = useAppStore((s) => s.setAgents)
  const currentConversationId = useAppStore((s) => s.currentConversationId)
  const activeView = useAppStore((s) => s.activeView)
  const setConnected = useAppStore((s) => s.setConnected)
  const handleStreamEvent = useAppStore((s) => s.handleStreamEvent)

  // 初始化：加载会话列表和 Agent 列表
  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then(setConversations)
      .catch(console.error)

    fetch('/api/agents')
      .then((r) => r.json())
      .then(setAgents)
      .catch(console.error)
  }, [setConversations, setAgents])

  // SSE 连接管理
  useEffect(() => {
    if (!currentConversationId) return

    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      es = new EventSource(`/api/stream?conversationId=${currentConversationId}`)

      es.onopen = () => setConnected(true)

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          if (event.type !== 'connected' && event.type !== 'heartbeat') {
            handleStreamEvent(event)
          }
        } catch {
          // ignore parse errors
        }
      }

      es.onerror = () => {
        setConnected(false)
        es?.close()
        reconnectTimer = setTimeout(connect, SSE_RECONNECT_INTERVAL)
      }
    }

    connect()

    return () => {
      es?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      setConnected(false)
    }
  }, [currentConversationId, setConnected, handleStreamEvent])

  return (
    <div className="flex h-screen">
      <Sidebar />
      {activeView === 'chat' && <ChatPanel />}
      {activeView === 'agents' && (
        <PlaceholderView
          icon={Bot}
          title="智能体"
          description="管理你的 Agent：配置模型、系统提示词、工具与知识库。"
        />
      )}
      {activeView === 'monitor' && (
        <PlaceholderView
          icon={Activity}
          title="模型流量监控"
          description="查看各模型的调用量、Token 消耗与响应延迟。"
        />
      )}
    </div>
  )
}
