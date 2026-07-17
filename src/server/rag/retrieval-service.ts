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
import { withSpan } from '@/server/tracing/span'

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
  return withSpan('rag:retrieve', 'retriever', async (span) => {
    span.update({ input: { query, kbCount: kbs.length, kbHint } })

    const targets = filterByHint(kbs, kbHint)
    if (targets.length === 0) return []

    // ① 向量化 query
    const queryVector = await withSpan('embed-query', 'embedding', async (s) => {
      const v = await embedText(query, targets[0].embeddingModel, signal)
      s.update({ metadata: { model: targets[0].embeddingModel, dim: v.length } })
      return v
    })

    // ② 各库并发召回（宁多勿漏，每库 RECALL_PER_KB）
    const candidates = await withSpan('vector-search', 'span', async (s) => {
      const perKb = await Promise.all(
        targets.map(async (kb) => {
          const hits = await searchVectors(kb.collectionName, queryVector, RECALL_PER_KB)
          return hits.map((h) => ({ ...h, knowledgeBaseId: kb.id }))
        })
      )
      const flat = perKb.flat()
      s.update({ metadata: { kbCount: targets.length, recallPerKb: RECALL_PER_KB, candidates: flat.length } })
      return flat
    })
    if (candidates.length === 0) return []

    // ③ 按 vectorId 回 SQLite 取原文（Milvus 只存向量）
    const pool = await withSpan('sqlite-hydrate', 'span', async (s) => {
      const vectorIds = candidates.map((c) => c.vectorId)
      const rows = await db.select().from(chunks).where(inArray(chunks.vectorId, vectorIds))
      const byVectorId = new Map(rows.map((r) => [r.vectorId, r]))
      const out: RetrievalHit[] = []
      for (const c of candidates) {
        const row = byVectorId.get(c.vectorId)
        if (!row) continue
        out.push({ content: row.content, score: c.score, documentId: row.documentId, knowledgeBaseId: c.knowledgeBaseId })
      }
      s.update({ metadata: { hydrated: out.length, orphans: candidates.length - out.length } })
      return out
    })
    if (pool.length === 0) return []

    // ④ 精排（可降级）；未配置 rerank 时降级为向量分数排序
    const rerankOn = await isRerankAvailable()
    const hits = await withSpan('rerank', 'span', async (s) => {
      if (rerankOn) {
        try {
          const ranked = await rerank(query, pool.map((p) => p.content), FINAL_TOP_K, signal)
          s.update({ metadata: { mode: 'rerank', in: pool.length, out: ranked.length } })
          return ranked.map((r) => ({ ...pool[r.index], score: r.score }))
        } catch (e) {
          // rerank 失败降级为向量分数排序，不阻断检索
          console.warn(`[rag] rerank 失败，降级为向量分数排序: ${(e as Error).message}`)
        }
      }
      s.update({ metadata: { mode: rerankOn ? 'rerank-fallback' : 'vector-score', in: pool.length } })
      return pool.sort((a, b) => b.score - a.score).slice(0, FINAL_TOP_K)
    })

    span.update({ output: { hitCount: hits.length }, metadata: { rerankEnabled: rerankOn } })
    return hits
  })
}
