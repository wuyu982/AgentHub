'use client'

import { useEffect } from 'react'
import { Activity } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { Sidebar } from '@/components/layout/sidebar'
import { PlaceholderView } from '@/components/layout/placeholder-view'
import { KnowledgePanel } from '@/components/knowledge/knowledge-panel'
import { AgentsPanel } from '@/components/agents/agents-panel'
import { ModelConfigsPanel } from '@/components/model-configs/model-configs-panel'
import { ChatPanel } from '@/components/chat/chat-panel'
import { SSE_RECONNECT_INTERVAL } from '@/shared/constants'
import type { StreamEvent } from '@/shared/types'

export function AppShell() {
  const setConversations = useAppStore((s) => s.setConversations)
  const setAgents = useAppStore((s) => s.setAgents)
  const currentConversationId = useAppStore((s) => s.currentConversationId)
  const activeView = useAppStore((s) => s.activeView)
  const setConnected = useAppStore((s) => s.setConnected)
  const handleStreamEvents = useAppStore((s) => s.handleStreamEvents)

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

    // rAF 合批：SSE 逐字到达，先入缓冲，每帧 flush 一次，避免每字触发重渲染导致浏览器绘制饥饿
    let buffer: StreamEvent[] = []
    let rafId: number | null = null
    const flush = () => {
      rafId = null
      if (buffer.length === 0) return
      const batch = buffer
      buffer = []
      handleStreamEvents(batch)
    }

    const connect = () => {
      es = new EventSource(`/api/stream?conversationId=${currentConversationId}`)

      es.onopen = () => setConnected(true)

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          if (event.type !== 'connected' && event.type !== 'heartbeat') {
            buffer.push(event)
            if (rafId === null) rafId = requestAnimationFrame(flush)
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
      if (rafId !== null) cancelAnimationFrame(rafId)
      buffer = []
      setConnected(false)
    }
  }, [currentConversationId, setConnected, handleStreamEvents])

  return (
    <div className="flex h-screen">
      <Sidebar />
      {activeView === 'chat' && <ChatPanel />}
      {activeView === 'agents' && <AgentsPanel />}
      {activeView === 'models' && <ModelConfigsPanel />}
      {activeView === 'knowledge' && <KnowledgePanel />}
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
