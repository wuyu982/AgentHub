/**
 * Milvus 客户端封装（L1）—— 连接管理 + collection CRUD + 向量增删查。
 * 只管向量存储，不碰 SQLite（元数据是 ingestion/retrieval service 的事）。
 *
 * collection schema（每个 KB 一个 collection）：
 *   id     VarChar 主键   —— 即 SQLite chunks.vectorId，双写对齐
 *   vector FloatVector   —— 维度由 embedding 模型决定，建库时传入
 *   kb_id  VarChar       —— 冗余存 KB id，便于排查
 */
import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node'

const VECTOR_FIELD = 'vector'
const ID_FIELD = 'id'
const KB_FIELD = 'kb_id'
const MAX_ID_LEN = 64
const MAX_KB_LEN = 64

// Next.js 热重载下复用连接，避免重复建连耗尽资源
const globalForMilvus = globalThis as unknown as { __milvusClient?: MilvusClient }

function getClient(): MilvusClient {
  if (!globalForMilvus.__milvusClient) {
    const address = process.env.MILVUS_ADDRESS
    if (!address) throw new Error('Milvus 连接失败：环境变量 MILVUS_ADDRESS 未配置')
    globalForMilvus.__milvusClient = new MilvusClient({ address })
  }
  return globalForMilvus.__milvusClient
}

// 检索命中项：向量主键 + 相似度分数（content 由调用方回 SQLite 取）
export interface VectorHit {
  vectorId: string
  score: number
}

// 待插入的向量记录
export interface VectorRecord {
  vectorId: string
  vector: number[]
  kbId: string
}

// 建 collection（含 schema + HNSW 索引 + load），已存在则跳过。dim 由 embedding 模型决定。
export async function createCollection(collectionName: string, dim: number): Promise<void> {
  const client = getClient()
  const exists = await client.hasCollection({ collection_name: collectionName })
  if (exists.value) return

  await client.createCollection({
    collection_name: collectionName,
    fields: [
      { name: ID_FIELD, data_type: DataType.VarChar, is_primary_key: true, max_length: MAX_ID_LEN },
      { name: VECTOR_FIELD, data_type: DataType.FloatVector, dim },
      { name: KB_FIELD, data_type: DataType.VarChar, max_length: MAX_KB_LEN },
    ],
  })

  await client.createIndex({
    collection_name: collectionName,
    field_name: VECTOR_FIELD,
    index_type: IndexType.HNSW,
    metric_type: MetricType.COSINE,
    params: { M: 16, efConstruction: 200 },
  })

  await client.loadCollectionSync({ collection_name: collectionName })
}

// 删整个 collection（KB 删除时调用）
export async function dropCollection(collectionName: string): Promise<void> {
  const client = getClient()
  const exists = await client.hasCollection({ collection_name: collectionName })
  if (!exists.value) return
  await client.dropCollection({ collection_name: collectionName })
}

// 批量插入向量
export async function insertVectors(collectionName: string, records: VectorRecord[]): Promise<void> {
  if (records.length === 0) return
  const client = getClient()
  const res = await client.insert({
    collection_name: collectionName,
    data: records.map((r) => ({ [ID_FIELD]: r.vectorId, [VECTOR_FIELD]: r.vector, [KB_FIELD]: r.kbId })),
  })
  if (res.status.error_code !== 'Success') {
    throw new Error(`Milvus 向量插入失败（collection=${collectionName}）：${res.status.reason}`)
  }
}

// 按 vectorId 批量删除（删文档时清理其 chunks 的向量）
export async function deleteVectors(collectionName: string, vectorIds: string[]): Promise<void> {
  if (vectorIds.length === 0) return
  const client = getClient()
  const idList = vectorIds.map((id) => `"${id}"`).join(', ')
  await client.delete({ collection_name: collectionName, filter: `${ID_FIELD} in [${idList}]` })
}

// ANN 检索单个 collection，返回 top-k 命中（vectorId + 分数）
export async function searchVectors(
  collectionName: string,
  queryVector: number[],
  topK: number
): Promise<VectorHit[]> {
  const client = getClient()
  const res = await client.search({
    collection_name: collectionName,
    data: [queryVector],
    limit: topK,
    output_fields: [ID_FIELD],
    metric_type: MetricType.COSINE,
  })
  if (res.status.error_code !== 'Success') {
    throw new Error(`Milvus 检索失败（collection=${collectionName}）：${res.status.reason}`)
  }
  return res.results.map((r) => ({ vectorId: String(r.id), score: r.score }))
}
