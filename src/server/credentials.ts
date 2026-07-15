/**
 * 凭证解析（L3）—— 按 CLAUDE.md §5.2 优先级为 Agent 解析 LLM 调用凭证：
 *   per-agent > app_settings（全局设置面板）> process.env（.env.local 兜底）
 * 缺失 key 不在此处抛错，交由 adapter 抛出（不在启动时拒绝服务）。
 */
import { db } from '@/db/client'
import { agents, appSettings } from '@/db/schema'
import { DEFAULT_MODEL_ID } from '@/shared/constants'

type AgentRow = typeof agents.$inferSelect

export interface ResolvedCredentials {
  apiKey: string
  baseURL?: string
  model: string
}

// agent 为 null 时解析全局凭证（用于路由器等非 agent 场景）
export async function resolveCredentials(agent: AgentRow | null): Promise<ResolvedCredentials> {
  const rows = await db.select().from(appSettings)
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value

  const apiKey =
    agent?.apiKey || settings['openai_api_key'] || process.env.OPENAI_API_KEY || ''

  const baseURL =
    agent?.baseURL || settings['openai_base_url'] || process.env.OPENAI_BASE_URL || undefined

  const model =
    agent?.modelId || settings['default_model'] || process.env.DEFAULT_MODEL || DEFAULT_MODEL_ID

  return { apiKey, baseURL, model }
}
