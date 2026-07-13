/**
 * SSE Stream Route
 * GET /api/stream?conversationId=xxx
 * 建立 SSE 连接，实时推送 AgentRunner 产出的 StreamEvent。
 */
import { NextRequest } from 'next/server'
import { eventBus } from '@/server/event-bus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) {
    return new Response('Missing conversationId', { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // 发送初始连接确认
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', conversationId })}\n\n`))

      // 订阅事件
      const unsubscribe = eventBus.subscribe(conversationId, (event) => {
        const data = JSON.stringify(event)
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      })

      // 心跳保活（30s）
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', conversationId, timestamp: Date.now() })}\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30000)

      // 连接关闭时清理
      req.signal.addEventListener('abort', () => {
        unsubscribe()
        clearInterval(heartbeat)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
