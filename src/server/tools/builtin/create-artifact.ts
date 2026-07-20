/**
 * create_artifact —— Agent 产出交付物（网页/代码/文档），落 artifacts 表。
 * result 带 artifactId 标记，runner 据此在消息里补插 artifact_ref part（前端据此渲染预览）。
 */
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/db/client'
import { artifacts } from '@/db/schema'
import type { ToolDef } from '@/server/tools/types'

const argsSchema = z.object({
  type: z.enum(['web_app', 'code_file', 'document']),
  title: z.string().min(1),
  content: z.string().min(1),
  language: z.string().optional(),
})

export const createArtifact: ToolDef = {
  name: 'create_artifact',
  description:
    '产出一个可预览的交付物并展示给用户。type=web_app（完整 HTML 网页，会在沙箱 iframe 中渲染）、code_file（代码文件，需给出 language）、document（Markdown 文档）。content 为完整正文。当你要交付一个网页、一段完整代码或一份文档时使用。',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: "产物类型：'web_app' | 'code_file' | 'document'" },
      title: { type: 'string', description: '产物标题，展示在卡片上' },
      content: { type: 'string', description: '产物完整正文（HTML / 代码 / Markdown）' },
      language: { type: 'string', description: 'code_file 的语言，如 "python"、"typescript"；其他类型可省略' },
    },
    required: ['type', 'title', 'content'],
  },
  async execute(args, ctx) {
    const parsed = argsSchema.safeParse(args)
    if (!parsed.success) {
      return { result: `参数非法: ${parsed.error.message}`, isError: true }
    }
    const { type, title, content, language } = parsed.data

    const id = nanoid()
    await db.insert(artifacts).values({
      id,
      conversationId: ctx.conversationId,
      messageId: ctx.messageId,
      type,
      title,
      content,
      language: language ?? null,
      createdAt: new Date(),
    })

    // artifactId 供 runner 识别并补插 artifact_ref part；回灌 LLM 的文本不含 content（避免重复占上下文）
    return { result: { artifactId: id, type, title }, isError: false }
  },
}
