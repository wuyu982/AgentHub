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
    // human-in-the-loop：需审批的工具执行前挂起，前端据 callId 在 tool_use 卡片上渲染批准/拒绝
    | { type: 'approval.request'; callId: string; toolName: string; summary: string }
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

// 一次 LLM 调用所需的全部凭证，独立实体；Agent 通过 modelConfigId 引用
// 含 apiKey 明文，仅在服务端（DB / 凭证解析）流转，绝不整体发往前端
export interface ModelConfigRecord {
  id: string
  name: string
  adapterName: AdapterName
  provider: ModelProvider | null
  modelId: string | null
  baseURL: string | null
  apiKey: string | null
  isDefault: boolean
  createdAt: number
}

// 发往前端的脱敏视图：不含 apiKey 明文，仅用 hasApiKey 标记是否已配置
export type ModelConfigView = Omit<ModelConfigRecord, 'apiKey'> & { hasApiKey: boolean }

export interface AgentRecord {
  id: string
  name: string
  avatar: string
  description: string
  systemPrompt: string
  modelConfigId: string | null // 引用 ModelConfig；空则用默认配置
  toolNames: string[]
  knowledgeBaseIds: string[] // 可检索的知识库范围
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

// ─── RAG 知识库实体（向量存 Milvus，元数据存 SQLite）──────────
export interface KnowledgeBaseRecord {
  id: string
  name: string
  description: string
  embeddingModel: string
  collectionName: string
  createdAt: number
}

export interface DocumentRecord {
  id: string
  knowledgeBaseId: string
  filename: string
  mimeType: string
  status: 'pending' | 'processing' | 'ready' | 'failed'
  error: string | null
  chunkCount: number
  createdAt: number
}

export interface ChunkRecord {
  id: string
  documentId: string
  knowledgeBaseId: string
  content: string
  chunkIndex: number
  vectorId: string
  createdAt: number
}

// ─── Artifact 产物实体 ─────────────────────────────────────
export type ArtifactType = 'web_app' | 'code_file' | 'document'

export interface ArtifactRecord {
  id: string
  conversationId: string
  messageId: string
  type: ArtifactType
  title: string
  content: string
  language: string | null
  createdAt: number
}
