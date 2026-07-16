/**
 * Rerank 服务（L3）—— 调独立 rerank API 对候选文档精排。
 * Jina/Cohere 兼容格式（智谱/硅基流动等）：
 *   POST {base}/rerank  body { model, query, documents, top_n }
 *   resp { results: [{ index, relevance_score }] }
 * 未配置 key 时不可用，由 retrieval 层降级为向量分数排序。
 */
import { resolveRerankCredentials } from '@/server/credentials'

// 重排结果：index 指向传入 documents 的下标，score 为相关性分数（降序）
export interface RerankResult {
  index: number
  score: number
}

// rerank 是否可用（key 已配置）。retrieval 据此决定走精排还是降级。
export async function isRerankAvailable(): Promise<boolean> {
  const { apiKey } = await resolveRerankCredentials()
  return Boolean(apiKey)
}

// 对 documents 按与 query 的相关性重排，返回 top-n 的 {index, score}（降序）。
export async function rerank(
  query: string,
  documents: string[],
  topN: number,
  signal?: AbortSignal
): Promise<RerankResult[]> {
  if (documents.length === 0) return []
  const { apiKey, baseURL, model } = await resolveRerankCredentials()
  if (!apiKey) throw new Error('Rerank 调用失败：未配置 rerank_api_key')
  if (!baseURL) throw new Error('Rerank 调用失败：未配置 rerank_base_url')

  const res = await fetch(`${baseURL}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, query, documents, top_n: topN }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Rerank 调用失败：返回 ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as { results?: { index: number; relevance_score: number }[] }
  if (!data.results) throw new Error('Rerank 调用失败：响应缺少 results 字段')

  return data.results.map((r) => ({ index: r.index, score: r.relevance_score }))
}
