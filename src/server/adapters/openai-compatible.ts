/**
 * OpenAI 兼容 Adapter（L2）—— 覆盖 OpenAI / DeepSeek / 火山方舟等兼容端点。
 * 只负责把 SDK 的流式 chunk 翻译成统一 AdapterEvent，不碰 DB。
 */
import OpenAI from 'openai'
import { AdapterEvent, AdapterRequest, LLMAdapter } from '@/server/adapters/types'

export class OpenAICompatibleAdapter implements LLMAdapter {
  async *run(request: AdapterRequest, signal: AbortSignal): AsyncGenerator<AdapterEvent> {
    if (!request.apiKey) {
      throw new Error(
        `OpenAICompatibleAdapter 缺少 apiKey（model=${request.model}）：请在 Agent、全局设置或 .env.local 中配置`,
      )
    }

    const client = new OpenAI({ apiKey: request.apiKey, baseURL: request.baseURL })

    const stream = await client.chat.completions.create(
      {
        model: request.model,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system' as const, content: request.systemPrompt }] : []),
          ...request.messages,
        ],
        stream: true,
      },
      { signal },
    )

    let started = false
    for await (const chunk of stream) {
      if (signal.aborted) break
      const delta = chunk.choices[0]?.delta?.content
      if (!delta) continue
      if (!started) {
        started = true
        yield { type: 'text.start' }
      }
      yield { type: 'text.delta', text: delta }
    }

    if (started) yield { type: 'text.end' }
    yield { type: 'done' }
  }

  async complete(request: AdapterRequest, signal?: AbortSignal): Promise<string> {
    if (!request.apiKey) {
      throw new Error(`OpenAICompatibleAdapter.complete 缺少 apiKey（model=${request.model}）`)
    }

    const client = new OpenAI({ apiKey: request.apiKey, baseURL: request.baseURL })

    const res = await client.chat.completions.create(
      {
        model: request.model,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system' as const, content: request.systemPrompt }] : []),
          ...request.messages,
        ],
        ...(request.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      },
      { signal },
    )

    return res.choices[0]?.message?.content ?? ''
  }
}
