/**
 * LLM adapter 接口定义（L2）层
 * 所有适配器（OpenAi/Anthropic/Mock）都实现这套契约.
 */
import type {ToolSchema} from '@/server/tools/types';

// assistant 发起的一次工具调用（中立形态，各 adapter 自行翻译成 provider 格式）
export interface AdapterToolCall {
    callId: string
    toolName: string
    args: unknown
}

// 判别联合：tool 结果与 assistant 形状差异大，联合让 adapter switch(role) 时精确 narrow
export type AdapterMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string; toolCalls?: AdapterToolCall[] } // 纯工具调用轮 content 可空串
    | { role: 'tool'; callId: string; toolName: string; result: unknown; isError: boolean }

export interface AdapterRequest {
    systemPrompt: string
    messages: AdapterMessage[]
    model: string
    apiKey: string
    baseURL?: string
    jsonMode?: boolean // complete() 时要求返回 JSON（OpenAI response_format）
    tools?: ToolSchema[] // 来自 tools/registry.ts 的 toToolSchemas()
}

export type AdapterEvent =
    | { type: 'thinking.start'}
    | { type: 'thinking.delta'; text: string} // 推理模型的思考流（如 deepseek 的 reasoning_content）
    | { type: 'thinking.end'}
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