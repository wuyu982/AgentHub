/**
 * OpenAI 兼容 Adapter（L2）—— 覆盖 OpenAI / DeepSeek / 火山方舟等兼容端点。
 * 只负责把统一 AdapterMessage/AdapterEvent 与 SDK 格式互相翻译，不碰 DB。
 */
import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { AdapterEvent, AdapterMessage, AdapterRequest, LLMAdapter } from '@/server/adapters/types'
import type { ToolSchema } from '@/server/tools/types'

// 中立 AdapterMessage → OpenAI 消息格式
function toOpenAIMessages(systemPrompt: string, messages: AdapterMessage[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = []
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt })

  for (const m of messages) {
    switch (m.role) {
      case 'system':
      case 'user':
        out.push({ role: m.role, content: m.content })
        break
      case 'assistant':
        out.push({
          role: 'assistant',
          content: m.content || null,
          ...(m.toolCalls?.length
            ? {
                tool_calls: m.toolCalls.map((tc) => ({
                  id: tc.callId,
                  type: 'function' as const,
                  function: { name: tc.toolName, arguments: JSON.stringify(tc.args ?? {}) },
                })),
              }
            : {}),
        })
        break
      case 'tool':
        out.push({
          role: 'tool',
          tool_call_id: m.callId,
          content: typeof m.result === 'string' ? m.result : JSON.stringify(m.result),
        })
        break
    }
  }
  return out
}

function toOpenAITools(tools?: ToolSchema[]): ChatCompletionTool[] | undefined {
  if (!tools?.length) return undefined
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as unknown as Record<string, unknown>,
    },
  }))
}

// 流式 tool_calls 按 index 累积（id/name 先到，arguments 逐片拼接）
interface PendingToolCall {
  callId: string
  toolName: string
  argsBuffer: string
}

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
        messages: toOpenAIMessages(request.systemPrompt, request.messages),
        ...(toOpenAITools(request.tools) ? { tools: toOpenAITools(request.tools) } : {}),
        stream: true,
      },
      { signal },
    )

    let thinkingStarted = false
    let textStarted = false
    const pending = new Map<number, PendingToolCall>()

    for await (const chunk of stream) {
      if (signal.aborted) break
      const choice = chunk.choices[0]
      const delta = choice?.delta

      // 思考增量：deepseek/R1 等推理模型把思考流放在 reasoning_content（SDK 类型未覆盖，窄类型读取）
      const reasoning = (delta as { reasoning_content?: string } | undefined)?.reasoning_content
      if (reasoning) {
        if (!thinkingStarted) {
          thinkingStarted = true
          yield { type: 'thinking.start' }
        }
        yield { type: 'thinking.delta', text: reasoning }
      }

      // 文本增量：正文一旦开始，思考阶段结束
      if (delta?.content) {
        if (thinkingStarted && !textStarted) yield { type: 'thinking.end' }
        if (!textStarted) {
          textStarted = true
          yield { type: 'text.start' }
        }
        yield { type: 'text.delta', text: delta.content }
      }

      // 工具调用增量：按 index 累积，等 finish 再统一吐 tool.call
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const slot = pending.get(tc.index) ?? { callId: '', toolName: '', argsBuffer: '' }
          if (tc.id) slot.callId = tc.id
          if (tc.function?.name) slot.toolName = tc.function.name
          if (tc.function?.arguments) slot.argsBuffer += tc.function.arguments
          pending.set(tc.index, slot)
        }
      }
    }

    // 思考后未接正文（直接工具调用/收敛）时补发 thinking.end，避免 part 悬空
    if (thinkingStarted && !textStarted) yield { type: 'thinking.end' }
    if (textStarted) yield { type: 'text.end' }

    // 拼接完成后一次性吐出各工具调用（参数解析失败时以空对象兜底，交由 executor/工具处理）
    for (const slot of pending.values()) {
      let args: unknown = {}
      try {
        args = slot.argsBuffer ? JSON.parse(slot.argsBuffer) : {}
      } catch {
        args = {}
      }
      yield { type: 'tool.call', callId: slot.callId, toolName: slot.toolName, args }
    }

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
        messages: toOpenAIMessages(request.systemPrompt, request.messages),
        ...(request.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      },
      { signal },
    )

    return res.choices[0]?.message?.content ?? ''
  }
}
