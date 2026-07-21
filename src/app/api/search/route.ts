/**
 * Search API — 全局搜索会话标题 + 消息文本
 * GET /api/search?q=xxx
 * 消息 parts 是 JSON 列：SQL LIKE 粗筛序列化串，再 Node 侧精确提取 text part 校验 + 生成高亮片段。
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { conversations, messages } from '@/db/schema'
import { like, desc } from 'drizzle-orm'
import type { MessagePart } from '@/shared/types'

const SNIPPET_RADIUS = 40 // 命中词前后各截取的字符数
const MAX_MESSAGE_HITS = 30

export interface SearchConversationHit {
  conversationId: string
  title: string
}

export interface SearchMessageHit {
  conversationId: string
  conversationTitle: string
  messageId: string
  role: string
  snippet: string
  createdAt: number
}

export interface SearchResult {
  conversations: SearchConversationHit[]
  messages: SearchMessageHit[]
}

// 提取消息里所有 text part 拼成纯文本（thinking/tool 不参与搜索）
function extractText(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return (parts as MessagePart[])
    .filter((p) => p.type === 'text')
    .map((p) => (p as { content: string }).content)
    .join('\n')
}

// 以命中词为中心截取片段（大小写不敏感）；找不到返回开头
function makeSnippet(text: string, q: string): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text.slice(0, SNIPPET_RADIUS * 2)
  const start = Math.max(0, idx - SNIPPET_RADIUS)
  const end = Math.min(text.length, idx + q.length + SNIPPET_RADIUS)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) {
    return NextResponse.json({ conversations: [], messages: [] } satisfies SearchResult)
  }

  const pattern = `%${q}%`

  // 会话标题命中
  const convHits = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(like(conversations.title, pattern))
    .orderBy(desc(conversations.updatedAt))

  // 消息文本命中：LIKE 粗筛（匹配 JSON 串），Node 侧精确校验 text part 确实含 q
  const titleById = new Map<string, string>()
  const allConvs = await db.select({ id: conversations.id, title: conversations.title }).from(conversations)
  for (const c of allConvs) titleById.set(c.id, c.title)

  const rawMsgs = await db
    .select()
    .from(messages)
    .where(like(messages.parts, pattern))
    .orderBy(desc(messages.createdAt))

  const msgHits: SearchMessageHit[] = []
  for (const m of rawMsgs) {
    const text = extractText(m.parts)
    if (!text.toLowerCase().includes(q.toLowerCase())) continue // 排除仅 JSON 结构/其他 part 误匹配
    msgHits.push({
      conversationId: m.conversationId,
      conversationTitle: titleById.get(m.conversationId) ?? '（已删除会话）',
      messageId: m.id,
      role: m.role,
      snippet: makeSnippet(text, q),
      createdAt: m.createdAt.getTime(),
    })
    if (msgHits.length >= MAX_MESSAGE_HITS) break
  }

  return NextResponse.json({
    conversations: convHits.map((c) => ({ conversationId: c.id, title: c.title })),
    messages: msgHits,
  } satisfies SearchResult)
}
