import {AdapterMessage, LLMAdapter} from "@/server/adapters/types";
import type {MessagePart} from "@/shared/types";
import {MockAdapter} from "@/server/adapters/mock";
import {OpenAICompatibleAdapter} from "@/server/adapters/openai-compatible";
import {resolveCredentials} from "@/server/credentials";
import {nanoid} from "nanoid";
import {db} from "@/db/client";
import {agents, messages} from "@/db/schema";
import {eq} from "drizzle-orm";
import {eventBus} from "@/server/event-bus";

function getAdapter(adapterName: string): LLMAdapter {
    switch(adapterName){
        case 'openai-compatible':
            return new OpenAICompatibleAdapter()
        case 'mock':
            return new MockAdapter()
        default:
            throw new Error(`未知的 adapter: ${adapterName}`)
    }
}

export async function runAgent(conversationId: string, agentId: string, triggerMessageId: string) {
    const runId = nanoid()
    //1.查Agent配置
    const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
    if (!agent) throw new Error(`Agent not found: ${agentId}`)

    //2.发出run.start事件
    eventBus.emit({
        type: "run.start",
        conversationId,
        timestamp: Date.now(),
        runId,
        agentId,
        triggerMessageId,
    })
    //3.查对话历史
    const dbMessages = await db.select().from(messages).where(eq(messages.conversationId,conversationId))
    const history: AdapterMessage[] = dbMessages.map((m) => ({
        role: m.role === 'agent' ? 'assistant' as const: m.role as 'user' | 'system',
        content: (m.parts as Array<{ type: string; content?: string}>)
            .filter((p) => p.type === 'text')
            .map((p) => p.content ?? '')
            .join(''),

    }))

    //4.选适配器，解析凭证，准备中止控制器与消息 id
    const adapter = getAdapter(agent.adapterName)
    const credentials = await resolveCredentials(agent)
    const controller = new AbortController()
    const messageId = nanoid()

    //5.发出 message.start 事件
    eventBus.emit({
        type: "message.start",
        conversationId,
        timestamp: Date.now(),
        messageId,
        agentId,
        runId,
    })

    // 累积各 part 的最终内容，供结束时落库
    const parts: MessagePart[] = []
    let partIndex = -1

    try {
        //6.遍历适配器事件流，翻译成 StreamEvent
        for await (const event of adapter.run({
            systemPrompt: agent.systemPrompt,
            messages: history,
            model: credentials.model,
            apiKey: credentials.apiKey,
            baseURL: credentials.baseURL,
        }, controller.signal)) {
            switch (event.type) {
                case 'text.start': {
                    partIndex++
                    const part: MessagePart = { type: 'text', content: '' }
                    parts[partIndex] = part
                    eventBus.emit({
                        type: "part.start",
                        conversationId,
                        timestamp: Date.now(),
                        messageId,
                        partIndex,
                        part,
                    })
                    break
                }

                case 'text.delta': {
                    const part = parts[partIndex]
                    if (part && part.type === 'text') part.content += event.text
                    eventBus.emit({
                        type: "part.delta",
                        conversationId,
                        timestamp: Date.now(),
                        messageId,
                        partIndex,
                        delta: { type: 'text.append', text: event.text },
                    })
                    break
                }

                case 'text.end': {
                    eventBus.emit({
                        type: "part.end",
                        conversationId,
                        timestamp: Date.now(),
                        messageId,
                        partIndex,
                    })
                    break
                }

                case 'done':
                    break
            }
        }

        //7.持久化 agent 消息，发出 message.end 与 run.end
        await db.insert(messages).values({
            id: messageId,
            conversationId,
            role: 'agent',
            agentId,
            parts,
            status: 'complete',
            parentMessageId: triggerMessageId,
            mentionedAgentIds: [],
            runId,
            createdAt: new Date(),
        })

        eventBus.emit({
            type: "message.end",
            conversationId,
            timestamp: Date.now(),
            messageId,
        })
        eventBus.emit({
            type: "run.end",
            conversationId,
            timestamp: Date.now(),
            runId,
            status: 'complete',
        })
    } catch (err) {
        // 失败时通知前端，不吞掉错误上下文
        eventBus.emit({
            type: "run.end",
            conversationId,
            timestamp: Date.now(),
            runId,
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
        })
        throw err
    }
}