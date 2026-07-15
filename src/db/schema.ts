import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// ─── Agents ─────────────────────────────────────────────────
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar').notNull().default('🤖'),
  description: text('description').notNull().default(''),
  systemPrompt: text('system_prompt').notNull().default(''),
  adapterName: text('adapter_name').notNull().default('openai-compatible'),
  modelProvider: text('model_provider'),
  modelId: text('model_id'),
  apiKey: text('api_key'),      // per-agent key，最高优先级；空则回退全局设置/env
  baseURL: text('base_url'),    // 自定义兼容端点，空则回退全局设置/env
  toolNames: text('tool_names', { mode: 'json' }).notNull().$type<string[]>().default([]),
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
