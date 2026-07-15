/**
 * AI 意图路由器（L3）—— 群聊无 @ 时，根据消息意图从候选 agent 中选出最合适的一个。
 * 这是一次「分类/选择」调用，选完交给 runAgent 正常回答，不是 Orchestrator，不涉及 tool-loop。
 */
import { db } from '@/db/client'
import { agents } from '@/db/schema'
import { inArray } from 'drizzle-orm'
import { OpenAICompatibleAdapter } from '@/server/adapters/openai-compatible'
import { resolveCredentials } from '@/server/credentials'

const ROUTER_SYSTEM_PROMPT =
  '你是群聊路由器。根据用户消息的意图，从候选 Agent 中选出最合适回答的那一个。' +
  '只返回 JSON：{"agentId": "<选中的 id>"}。agentId 必须来自候选列表，不要编造。'

/** 从候选 agent 中选一个来回应用户消息；失败时兜底返回第一个候选。 */
export async function routeToAgent(agentIds: string[], userMessage: string): Promise<string | null> {
  if (agentIds.length === 0) return null
  if (agentIds.length === 1) return agentIds[0]

  const candidates = await db.select().from(agents).where(inArray(agents.id, agentIds))
  if (candidates.length <= 1) return candidates[0]?.id ?? null

  const roster = candidates
    .map((a) => `- id: ${a.id}\n  名称: ${a.name}\n  职责: ${a.description}`)
    .join('\n')
  const prompt = `候选 Agent：\n${roster}\n\n用户消息：${userMessage}\n\n请返回 JSON。`

  const creds = await resolveCredentials(null)
  const adapter = new OpenAICompatibleAdapter()

  try {
    const raw = await adapter.complete({
      systemPrompt: ROUTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      model: creds.model,
      apiKey: creds.apiKey,
      baseURL: creds.baseURL,
      jsonMode: true,
    })
    const parsed = JSON.parse(raw) as { agentId?: string }
    if (parsed.agentId && agentIds.includes(parsed.agentId)) return parsed.agentId
  } catch {
    // 调用或解析失败 → 走兜底
  }

  return agentIds[0]
}
