/**
 * rag_search —— 在 Agent 绑定的知识库中检索相关内容。
 * KB 范围来自 ctx.knowledgeBaseIds（runner 注入），LLM 只能传 query + 可选 hint，无法越权查其他库。
 */
import { z } from 'zod'
import { db } from '@/db/client'
import { knowledgeBases } from '@/db/schema'
import { inArray } from 'drizzle-orm'
import type { ToolDef } from '@/server/tools/types'
import { retrieve } from '@/server/rag/retrieval-service'

const argsSchema = z.object({
  query: z.string().min(1),
  kbHint: z.string().optional(),
})

export const ragSearch: ToolDef = {
  name: 'rag_search',
  description:
    '在你绑定的知识库中检索相关内容。当需要查阅私有文档、领域知识或用户上传的资料时使用。传入自然语言 query 描述你要找什么。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '自然语言检索问题，描述你想找的内容' },
      kbHint: { type: 'string', description: '可选：提示优先检索哪类知识库（如"代码库"），不确定可留空' },
    },
    required: ['query'],
  },
  async execute(args, ctx) {
    const parsed = argsSchema.safeParse(args)
    if (!parsed.success) {
      return { result: `参数非法: ${parsed.error.message}`, isError: true }
    }
    const { query, kbHint } = parsed.data

    const kbIds = ctx.knowledgeBaseIds ?? []
    if (kbIds.length === 0) {
      return { result: '当前 Agent 未绑定任何知识库，无法检索', isError: true }
    }

    const kbs = await db.select().from(knowledgeBases).where(inArray(knowledgeBases.id, kbIds))
    if (kbs.length === 0) {
      return { result: '绑定的知识库不存在（可能已被删除）', isError: true }
    }

    const hits = await retrieve(query, kbs, kbHint, ctx.signal)
    if (hits.length === 0) {
      return { result: '知识库中未检索到相关内容', isError: false }
    }

    // 带来源序号标注回灌，便于 LLM 引用
    const passages = hits.map((h, i) => `[${i + 1}] ${h.content}`).join('\n\n')
    return { result: { query, count: hits.length, passages }, isError: false }
  },
}
