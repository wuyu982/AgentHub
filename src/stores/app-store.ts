/**
 * Zustand App Store — 前端全局状态。
 * 管理会话列表、当前会话、消息、Agent 列表等。
 */
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { MessageRecord, AgentRecord, ConversationRecord, StreamEvent } from '@/shared/types'

// 左侧导航对应的右侧主区视图
export type ActiveView = 'chat' | 'agents' | 'models' | 'knowledge' | 'monitor'

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
  upsertAgent: (agent: AgentRecord) => void
  removeAgent: (id: string) => void
  setMessages: (conversationId: string, messages: MessageRecord[]) => void
  addMessage: (conversationId: string, message: MessageRecord) => void
  setConnected: (connected: boolean) => void

  // ─── StreamEvent 处理 ──────────────────────────────
  handleStreamEvent: (event: StreamEvent) => void
  // 批量应用：rAF 合批时一次 set 内消费多个事件，每帧只触发一次重渲染
  handleStreamEvents: (events: StreamEvent[]) => void
}

// 纯 reducer：在 draft 上应用单个事件（供单发/批量共用）
function applyEvent(state: AppState, event: StreamEvent) {
  const { conversationId } = event
  if (!state.messages[conversationId]) {
    state.messages[conversationId] = []
  }
  const msgs = state.messages[conversationId]

  switch (event.type) {
    case 'message.start': {
      // 幂等：手动发的消息已由 fetch 响应入列表，重复事件不再造分身
      if (msgs.some((m) => m.id === event.messageId)) break
      // agentId 为空 = 用户/子任务消息（complete，无流式）；非空 = agent 开始流式发言
      const isAgent = event.agentId !== ''
      const newMsg: MessageRecord = {
        id: event.messageId,
        conversationId,
        role: isAgent ? 'agent' : 'user',
        agentId: isAgent ? event.agentId : null,
        parts: [],
        status: isAgent ? 'streaming' : 'complete',
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

    // 新建插到列表头，已存在则原地更新
    upsertAgent: (agent) =>
      set((state) => {
        const i = state.agents.findIndex((a) => a.id === agent.id)
        if (i === -1) state.agents.unshift(agent)
        else state.agents[i] = agent
      }),

    removeAgent: (id) =>
      set((state) => {
        state.agents = state.agents.filter((a) => a.id !== id)
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

    handleStreamEvent: (event) => set((state) => applyEvent(state, event)),

    // 一次 set 内顺序应用整批事件，配合 rAF 合批把每帧的重渲染压到一次
    handleStreamEvents: (events) =>
      set((state) => {
        for (const event of events) applyEvent(state, event)
      }),
  }))
)
