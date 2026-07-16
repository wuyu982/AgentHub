/**
 * Embedding 服务（L3）—— 调 Embedding API 把文本转向量。
 * 走 OpenAI 兼容 embeddings 协议（OpenAI / 火山 / 自定义兼容端点通用）。
 * 凭证走 resolveEmbeddingCredentials（app_settings > env）。
 */
import OpenAI from 'openai'
import { resolveEmbeddingCredentials } from '@/server/credentials'

// embedding API 单次请求条数上限（多数端点 2048，保守取值）
const BATCH_SIZE = 256

async function getClient(model?: string): Promise<{ client: OpenAI; model: string }> {
  const { apiKey, baseURL, model: resolvedModel } = await resolveEmbeddingCredentials(model)
  if (!apiKey) throw new Error('Embedding 调用失败：未配置 embedding_api_key（app_settings 或 EMBEDDING_API_KEY）')
  return { client: new OpenAI({ apiKey, baseURL }), model: resolvedModel }
}

// 单条文本 → 向量。用于检索时的 query 向量化。
export async function embedText(text: string, model?: string, signal?: AbortSignal): Promise<number[]> {
  const { client, model: m } = await getClient(model)
  const res = await client.embeddings.create({ model: m, input: text }, { signal })
  return res.data[0].embedding
}

// 探测模型向量维度（建 KB collection 需要 dim；维度与模型绑定）
export async function probeDimension(model?: string): Promise<number> {
  const vec = await embedText('dimension probe', model)
  return vec.length
}

// 批量文本 → 向量（保序）。用于文档 ingestion。分批发送以尊重 API 上限。
export async function embedBatch(texts: string[], model?: string, signal?: AbortSignal): Promise<number[][]> {
  if (texts.length === 0) return []
  const { client, model: m } = await getClient(model)

  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const res = await client.embeddings.create({ model: m, input: batch }, { signal })
    // API 保证按 index 返回，但显式按 index 排序防端点乱序
    const sorted = [...res.data].sort((a, b) => a.index - b.index)
    for (const d of sorted) out.push(d.embedding)
  }
  return out
}
