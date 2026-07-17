import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// ─── Model Configs ──────────────────────────────────────────
// 一次 LLM 调用所需的全部凭证，独立于 Agent；Agent 通过 modelConfigId 引用。
// adapterName 跟随此处（adapter 类型与 endpoint/key 强绑定，不留在 Agent 上）。
export const modelConfigs = sqliteTable('model_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),                                    // 展示名，如 "DeepSeek 官方"
  adapterName: text('adapter_name').notNull().default('openai-compatible'),
  provider: text('provider'),                                      // 语义标签
  modelId: text('model_id'),
  baseURL: text('base_url'),
  apiKey: text('api_key'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false), // Agent 未指定时的兜底
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Agents ─────────────────────────────────────────────────
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar').notNull().default('🤖'),
  description: text('description').notNull().default(''),
  systemPrompt: text('system_prompt').notNull().default(''),
  modelConfigId: text('model_config_id'),  // 引用 model_configs.id；空则用默认配置
  toolNames: text('tool_names', { mode: 'json' }).notNull().$type<string[]>().default([]),
  knowledgeBaseIds: text('knowledge_base_ids', { mode: 'json' }).notNull().$type<string[]>().default([]), // 可检索的知识库范围
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  isOrchestrator: integer('is_orchestrator', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Conversations ──────────────────────────────────────────
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  mode: text('mode', { enum: ['single', 'group'] }).notNull().default('single'),
  agentIds: text('agent_ids', { mode: 'json' }).notNull().$type<string[]>().default([]),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Messages ───────────────────────────────────────────────
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'agent', 'system'] }).notNull(),
  agentId: text('agent_id'),
  parts: text('parts', { mode: 'json' }).notNull().$type<unknown[]>().default([]),
  status: text('status', { enum: ['streaming', 'complete', 'error', 'aborted'] }).notNull().default('complete'),
  parentMessageId: text('parent_message_id'),
  mentionedAgentIds: text('mentioned_agent_ids', { mode: 'json' }).notNull().$type<string[]>().default([]),
  runId: text('run_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Agent Runs ─────────────────────────────────────────────
export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull(),
  triggerMessageId: text('trigger_message_id').notNull(),
  status: text('status', { enum: ['running', 'complete', 'failed', 'aborted'] }).notNull().default('running'),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
})

// ─── App Settings ───────────────────────────────────────────
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// ─── Knowledge Bases ────────────────────────────────────────
export const knowledgeBases = sqliteTable('knowledge_bases', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  embeddingModel: text('embedding_model').notNull(), // 向量化模型，建库时定死（决定向量维度）
  collectionName: text('collection_name').notNull(), // 对应的 Milvus collection 名
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Documents ──────────────────────────────────────────────
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  knowledgeBaseId: text('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull().default(''),
  status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] }).notNull().default('pending'),
  error: text('error'), // status=failed 时的原因
  chunkCount: integer('chunk_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// ─── Chunks ─────────────────────────────────────────────────
export const chunks = sqliteTable('chunks', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  knowledgeBaseId: text('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }), // 冗余：检索合并/按 KB 删除少一次 join
  content: text('content').notNull(), // 分块原文，检索命中后回灌用
  chunkIndex: integer('chunk_index').notNull(), // 在文档内的顺序
  vectorId: text('vector_id').notNull(), // Milvus 主键，双写对齐
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
