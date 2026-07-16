/**
 * Zustand App Store — 前端全局状态。
 * 管理会话列表、当前会话、消息、Agent 列表等。
 */
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { MessageRecord, AgentRecord, ConversationRecord, StreamEvent } from '@/shared/types'

// 左侧导航对应的右侧主区视图
export type ActiveView = 'chat' | 'agents' | 'monitor'

interface AppState {
  // ─── Data ─────────────────────────────────────────
  conversations: ConversationRecord[]
  currentConversationId: string | null
  messages: Record<string, MessageRecord[]> // conversationId → messages
  agents: AgentRecord[]

  // ─── UI 视图状态 ───────────────────────────────────
  activeView: ActiveView

  // ─── SSE 连接状态 ──────────────────────────────────
  connected: boolean

  // ─── Actions ──────────────────────────────────────
  setActiveView: (view: ActiveView) => void
  setConversations: (conversations: ConversationRecord[]) => void
  setCurrentConversation: (id: string | null) => void
  addConversation: (conversation: ConversationRecord) => void
  setAgents: (agents: AgentRecord[]) => void
  setMessages: (conversationId: string, messages: MessageRecord[]) => void
  addMessage: (conversationId: string, message: MessageRecord) => void
  setConnected: (connected: boolean) => void

  // ─── StreamEvent 处理 ──────────────────────────────
  handleStreamEvent: (event: StreamEvent) => void
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    conversations: [],
    currentConversationId: null,
    messages: {},
    agents: [],
    activeView: 'chat',
    connected: false,

    setActiveView: (view) =>
      set((state) => {
        state.activeView = view
      }),

    setConversations: (conversations) =>
      set((state) => {
        state.conversations = conversations
      }),

    // 选中会话时自动回到对话视图，让会话列表也能作为常驻快捷入口
    setCurrentConversation: (id) =>
      set((state) => {
        state.currentConversationId = id
        if (id) state.activeView = 'chat'
      }),

    addConversation: (conversation) =>
      set((state) => {
        state.conversations.unshift(conversation)
      }),

    setAgents: (agents) =>
      set((state) => {
        state.agents = agents
      }),

    setMessages: (conversationId, messages) =>
      set((state) => {
        state.messages[conversationId] = messages
      }),

    addMessage: (conversationId, message) =>
      set((state) => {
        if (!state.messages[conversationId]) {
          state.messages[conversationId] = []
        }
        state.messages[conversationId].push(message)
      }),

    setConnected: (connected) =>
      set((state) => {
        state.connected = connected
      }),

    handleStreamEvent: (event) =>
      set((state) => {
        const { conversationId } = event
        if (!state.messages[conversationId]) {
          state.messages[conversationId] = []
        }
        const msgs = state.messages[conversationId]

        switch (event.type) {
          case 'message.start': {
            const newMsg: MessageRecord = {
              id: event.messageId,
              conversationId,
              role: 'agent',
              agentId: event.agentId,
              parts: [],
              status: 'streaming',
              parentMessageId: null,
              mentionedAgentIds: [],
              runId: event.runId,
              createdAt: event.timestamp,
            }
            msgs.push(newMsg)
            break
          }

          case 'message.end': {
            const msg = msgs.find((m) => m.id === event.messageId)
            if (msg) msg.status = 'complete'
            break
          }

          case 'part.start': {
            const msg = msgs.find((m) => m.id === event.messageId)
            if (msg) {
              msg.parts[event.partIndex] = event.part
            }
            break
          }

          case 'part.delta': {
            const msg = msgs.find((m) => m.id === event.messageId)
            if (!msg) break
            const part = msg.parts[event.partIndex]
            if (!part) break

            const delta = event.delta
            if (delta.type === 'text.append' && part.type === 'text') {
              part.content += delta.text
            } else if (delta.type === 'thinking.append' && part.type === 'thinking') {
              part.content += delta.text
            }
            break
          }

          case 'run.end': {
            if (event.status === 'failed') {
              // 标记最后一条 streaming 消息为 error
              const streamingMsg = msgs.findLast((m) => m.status === 'streaming')
              if (streamingMsg) streamingMsg.status = 'error'
            }
            break
          }
        }
      }),
  }))
)
