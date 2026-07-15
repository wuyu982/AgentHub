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
}

export type AdapterEvent =
    | { type: 'text.start'}
    | { type: 'text.delta'; text: string}
    | { type: 'text.end'}
    | { type: 'tool.call'; callId: string; toolName: string; args: unknown}
    | { type: 'done'}

export interface LLMAdapter {
    run(request: AdapterRequest,signal: AbortSignal): AsyncGenerator<AdapterEvent>
}