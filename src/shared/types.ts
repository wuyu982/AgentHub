/**
 * 共享类型 — 前后端共用。
 */

// ─── MessagePart 联合类型 ─────────────────────────────────
export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_use'; callId: string; toolName: string; args: unknown }
  | { type: 'tool_result'; callId: string; result: unknown; isError: boolean }
  | { type: 'artifact_ref'; artifactId: string }

// ─── 增量 delta（流式追加）─────────────────────────────────
export type PartDelta =
  | { type: 'text.append'; text: string }
  | { type: 'thinking.append'; text: string }

// ─── Adapter 名称 ──────────────────────────────────────────
export type AdapterName = 'openai-compatible' | 'anthropic' | 'mock'

export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'volcano-ark'
  | 'openai-compatible'

// ─── StreamEvent 联合 ─────────────────────────────────────
interface BaseEvent {
  conversationId: string
  timestamp: number
}

export type StreamEvent = BaseEvent &
  (
    | { type: 'run.start'; runId: string; agentId: string; triggerMessageId: string }
    | { type: 'run.end'; runId: string; status: 'complete' | 'failed' | 'aborted'; error?: string }
    | { type: 'message.start'; messageId: string; agentId: string; runId: string }
    | { type: 'message.end'; messageId: string }
    | { type: 'part.start'; messageId: string; partIndex: number; part: MessagePart }
    | { type: 'part.delta'; messageId: string; partIndex: number; delta: PartDelta }
    | { type: 'part.end'; messageId: string; partIndex: number }
    | { type: 'tool.call'; messageId: string; callId: string; toolName: string; args: unknown }
    | { type: 'tool.result'; messageId: string; callId: string; result: unknown; isError: boolean }
    | { type: 'heartbeat' }
  )

// ─── Record types for event payloads ─────────────────────
export interface MessageRecord {
  id: string
  conversationId: string
  role: 'user' | 'agent' | 'system'
  agentId: string | null
  parts: MessagePart[]
  status: 'streaming' | 'complete' | 'error' | 'aborted'
  parentMessageId: string | null
  mentionedAgentIds: string[]
  runId: string | null
  createdAt: number
}

export interface AgentRecord {
  id: string
  name: string
  avatar: string
  description: string
  systemPrompt: string
  adapterName: AdapterName
  modelProvider: ModelProvider | null
  modelId: string | null
  apiKey: string | null
  baseURL: string | null
  toolNames: string[]
  isBuiltin: boolean
  isOrchestrator: boolean
  createdAt: number
}

export interface ConversationRecord {
  id: string
  title: string
  mode: 'single' | 'group'
  agentIds: string[]
  createdAt: number
  updatedAt: number
}
