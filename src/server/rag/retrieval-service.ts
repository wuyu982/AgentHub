/**
 * 检索服务（L3）—— RAG 读取侧核心。
 * hint 过滤 → query 向量化 → 多库召回 → 回 SQLite 取原文 → rerank 精排（可降级）。
 *
 * 两阶段：召回宁多勿漏（每库 RECALL_PER_KB），精排取 FINAL_TOP_K 回灌 LLM。
 * rerank 未配置时降级为按向量分数排序，不阻断检索。
 * KB 范围由调用方（rag_search 工具，经 runner 注入）传入 —— LLM 无法越权。
 */
import { db } from '@/db/client'
import { chunks } from '@/db/schema'
import { inArray } from 'drizzle-orm'
import { embedText } from '@/server/rag/embedding-service'
import { searchVectors } from '@/server/rag/milvus-client'
import { rerank, isRerankAvailable } from '@/server/rag/rerank-service'

const RECALL_PER_KB = 20 // 每库召回候选数（宁多勿漏）
const FINAL_TOP_K = 8 // 精排后回灌 LLM 的条数

// 检索只需 KB 的这几个字段（不依赖 createdAt，符合接口隔离）
type RetrievalKB = { id: string; name: string; description: string; embeddingModel: string; collectionName: string }

// 检索命中项，回灌 LLM 用
export interface RetrievalHit {
  content: string
  score: number
  documentId: string
  knowledgeBaseId: string
}

// hint 档1匹配：kbHint 关键词包含于 kb.name/description 则命中。命中缩小范围，否则查全部。
function filterByHint(kbs: RetrievalKB[], kbHint?: string): RetrievalKB[] {
  if (!kbHint?.trim()) return kbs
  const hint = kbHint.toLowerCase()
  const matched = kbs.filter((kb) => {
    const hay = `${kb.name} ${kb.description}`.toLowerCase()
    return hay.includes(hint) || hint.includes(kb.name.toLowerCase())
  })
  return matched.length > 0 ? matched : kbs
}

// 在给定 KB 范围内检索。kbs 为 runner 注入的可查库（安全边界），不可越出。
export async function retrieve(
  query: string,
  kbs: RetrievalKB[],
  kbHint?: string,
  signal?: AbortSignal
): Promise<RetrievalHit[]> {
  const targets = filterByHint(kbs, kbHint)
  if (targets.length === 0) return []

  const queryVector = await embedText(query, targets[0].embeddingModel, signal)

  // 各库并发召回
  const perKb = await Promise.all(
    targets.map(async (kb) => {
      const hits = await searchVectors(kb.collectionName, queryVector, RECALL_PER_KB)
      return hits.map((h) => ({ ...h, knowledgeBaseId: kb.id }))
    })
  )
  const candidates = perKb.flat()
  if (candidates.length === 0) return []

  // 按 vectorId 回 SQLite 取原文（Milvus 只存向量）
  const vectorIds = candidates.map((c) => c.vectorId)
  const rows = await db.select().from(chunks).where(inArray(chunks.vectorId, vectorIds))
  const byVectorId = new Map(rows.map((r) => [r.vectorId, r]))

  // 组装候选（跳过 SQLite 查不到的孤儿向量）
  const pool: RetrievalHit[] = []
  for (const c of candidates) {
    const row = byVectorId.get(c.vectorId)
    if (!row) continue
    pool.push({ content: row.content, score: c.score, documentId: row.documentId, knowledgeBaseId: c.knowledgeBaseId })
  }
  if (pool.length === 0) return []

  // 精排（可降级）
  if (await isRerankAvailable()) {
    try {
      const ranked = await rerank(query, pool.map((p) => p.content), FINAL_TOP_K, signal)
      return ranked.map((r) => ({ ...pool[r.index], score: r.score }))
    } catch (e) {
      // rerank 失败降级为向量分数排序，不阻断检索
      console.warn(`[rag] rerank 失败，降级为向量分数排序: ${(e as Error).message}`)
    }
  }
  return pool.sort((a, b) => b.score - a.score).slice(0, FINAL_TOP_K)
}
