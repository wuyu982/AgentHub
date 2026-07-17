/**
 * 凭证解析（L3）—— 按 CLAUDE.md §5.2 优先级为 Agent 解析 LLM 调用凭证：
 *   per-agent > app_settings（全局设置面板）> process.env（.env.local 兜底）
 * 缺失 key 不在此处抛错，交由 adapter 抛出（不在启动时拒绝服务）。
 */
import { db } from '@/db/client'
import { appSettings, modelConfigs } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { DEFAULT_MODEL_ID } from '@/shared/constants'
import type { AdapterName } from '@/shared/types'

export interface ResolvedCredentials {
  apiKey: string
  baseURL?: string
  model: string
}

// 对话 LLM 额外携带 adapterName（embedding/rerank 不涉及 adapter，故分开）
export interface ResolvedChatCredentials extends ResolvedCredentials {
  adapterName: AdapterName
}

// 按 modelConfigId 解析对话 LLM 凭证：指定则查该条，否则用 isDefault 那条；均缺失时回退 env。
// modelConfigId 为 null 用于路由器等未绑定 Agent 的场景。缺 key 不抛错，交由 adapter 抛出。
export async function resolveCredentials(modelConfigId: string | null): Promise<ResolvedChatCredentials> {
  let config: typeof modelConfigs.$inferSelect | undefined
  if (modelConfigId) {
    ;[config] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, modelConfigId))
  }
  if (!config) {
    ;[config] = await db.select().from(modelConfigs).where(eq(modelConfigs.isDefault, true))
  }

  const adapterName = (config?.adapterName as AdapterName) || 'openai-compatible'
  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY || ''
  const baseURL = config?.baseURL || process.env.OPENAI_BASE_URL || undefined
  const model = config?.modelId || process.env.DEFAULT_MODEL || DEFAULT_MODEL_ID

  return { adapterName, apiKey, baseURL, model }
}

// Embedding 凭证：独立于对话 LLM。优先级 app_settings > env（不涉及 per-agent，模型在建 KB 时定死）。
// model 参数为已建 KB 存下的 embeddingModel，覆盖全局默认；缺失 key 交由调用处抛错。
export async function resolveEmbeddingCredentials(model?: string): Promise<ResolvedCredentials> {
  const rows = await db.select().from(appSettings)
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value

  const apiKey = settings['embedding_api_key'] || process.env.EMBEDDING_API_KEY || ''
  const baseURL = settings['embedding_base_url'] || process.env.EMBEDDING_BASE_URL || undefined
  const resolvedModel =
    model || settings['embedding_model'] || process.env.EMBEDDING_MODEL || 'text-embedding-3-small'

  return { apiKey, baseURL, model: resolvedModel }
}

// Rerank 凭证：优先级 app_settings > env。key 可空——调用处据此降级为向量分数排序，不阻断检索。
export async function resolveRerankCredentials(): Promise<ResolvedCredentials> {
  const rows = await db.select().from(appSettings)
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value

  const apiKey = settings['rerank_api_key'] || process.env.RERANK_API_KEY || ''
  const baseURL = settings['rerank_base_url'] || process.env.RERANK_BASE_URL || undefined
  const model = settings['rerank_model'] || process.env.RERANK_MODEL || ''

  return { apiKey, baseURL, model }
}
