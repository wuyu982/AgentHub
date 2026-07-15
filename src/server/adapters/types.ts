/**
 * LLM adapter 接口定义（L2）层
 * 所有适配器（OpenAi/Anthropic/Mock）都实现这套契约.
 */
import type {MessagePart} from '@/shared/types';

export interface AdapterMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
}

export interface AdapterRequest {
    systemPrompt: string
    messages: AdapterMessage[]
    model: string
    apiKey: string
    baseURL?: string
    jsonMode?: boolean // complete() 时要求返回 JSON（OpenAI response_format）
}

export type AdapterEvent =
    | { type: 'text.start'}
    | { type: 'text.delta'; text: string}
    | { type: 'text.end'}
    | { type: 'tool.call'; callId: string; toolName: string; args: unknown}
    | { type: 'done'}

export interface LLMAdapter {
    run(request: AdapterRequest,signal: AbortSignal): AsyncGenerator<AdapterEvent>
    // 非流式补全：用于路由 / 分类等需要完整结果的场景，返回完整文本
    complete(request: AdapterRequest, signal?: AbortSignal): Promise<string>
}