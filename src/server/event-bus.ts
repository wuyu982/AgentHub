/**
 * EventBus — 服务端事件总线。
 * AgentRunner 产出 StreamEvent → EventBus 广播 → SSE route 推送到前端。
 */
import type { StreamEvent } from '@/shared/types'

type Listener = (event: StreamEvent) => void

class EventBus {
  private listeners = new Map<string, Set<Listener>>()

  /** 订阅某个 conversation 的事件流 */
  subscribe(conversationId: string, listener: Listener): () => void {
    if (!this.listeners.has(conversationId)) {
      this.listeners.set(conversationId, new Set())
    }
    this.listeners.get(conversationId)!.add(listener)

    // 返回取消订阅函数
    return () => {
      const set = this.listeners.get(conversationId)
      if (set) {
        set.delete(listener)
        if (set.size === 0) this.listeners.delete(conversationId)
      }
    }
  }

  /** 发布事件到指定 conversation 的所有订阅者 */
  emit(event: StreamEvent) {
    const set = this.listeners.get(event.conversationId)
    if (set) {
      for (const listener of set) {
        try {
          listener(event)
        } catch (e) {
          console.error('[EventBus] listener error:', e)
        }
      }
    }
  }

  /** 全局广播（如 heartbeat） */
  broadcast(event: StreamEvent) {
    for (const [, set] of this.listeners) {
      for (const listener of set) {
        try {
          listener(event)
        } catch (e) {
          console.error('[EventBus] broadcast listener error:', e)
        }
      }
    }
  }
}

// 单例
export const eventBus = new EventBus()
