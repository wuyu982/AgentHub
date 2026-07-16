/**
 * 文档 Ingestion Pipeline（L3）—— 串联提取 → 分块 → 向量化 → 双写。
 * 提取(Tika) → chunkText → embedBatch → Milvus 向量 + SQLite chunks 元数据。
 *
 * 双写顺序：先 Milvus 后 SQLite。Milvus 失败则 SQLite 不留孤儿；反之 Milvus 有孤儿
 * 向量但检索回 SQLite 取 content 查不到会跳过，可接受。
 * status 流转：processing → ready / failed（失败不 throw，落 error 字段）。
 */
import { nanoid } from 'nanoid'
import { db } from '@/db/client'
import { documents, chunks } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { extractText } from '@/server/rag/text-extractor'
import { chunkText } from '@/server/rag/chunking'
import { embedBatch } from '@/server/rag/embedding-service'
import { insertVectors } from '@/server/rag/milvus-client'

// ingestion 只需 KB 这几个字段（不依赖 createdAt，符合接口隔离）
type IngestionKB = { id: string; embeddingModel: string; collectionName: string }

// 对已建 Document 执行 ingestion。documentId 须已存在（status=pending）。失败落 error，不抛。
export async function ingestDocument(
  kb: IngestionKB,
  documentId: string,
  bytes: Uint8Array,
  contentType?: string,
  signal?: AbortSignal
): Promise<void> {
  try {
    await db.update(documents).set({ status: 'processing' }).where(eq(documents.id, documentId))

    const text = await extractText(bytes, contentType, signal)
    const pieces = chunkText(text)
    if (pieces.length === 0) {
      await db.update(documents).set({ status: 'ready', chunkCount: 0 }).where(eq(documents.id, documentId))
      return
    }

    const vectors = await embedBatch(pieces, kb.embeddingModel, signal)

    // 为每块生成 vectorId（Milvus 主键 = SQLite 记录，双写对齐）
    const rows = pieces.map((content, i) => ({
      id: nanoid(),
      documentId,
      knowledgeBaseId: kb.id,
      content,
      chunkIndex: i,
      vectorId: nanoid(),
      createdAt: new Date(),
    }))

    // 先 Milvus 后 SQLite
    await insertVectors(
      kb.collectionName,
      rows.map((r) => ({ vectorId: r.vectorId, vector: vectors[r.chunkIndex], kbId: kb.id }))
    )
    await db.insert(chunks).values(rows)

    await db
      .update(documents)
      .set({ status: 'ready', chunkCount: rows.length })
      .where(eq(documents.id, documentId))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.update(documents).set({ status: 'failed', error: msg }).where(eq(documents.id, documentId))
  }
}
