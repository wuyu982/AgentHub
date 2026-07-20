import {AdapterMessage, AdapterToolCall, LLMAdapter} from "@/server/adapters/types";
import type {MessagePart} from "@/shared/types";
import {MockAdapter} from "@/server/adapters/mock";
import {OpenAICompatibleAdapter} from "@/server/adapters/openai-compatible";
import {resolveCredentials} from "@/server/credentials";
import {resolveTools, toToolSchemas} from "@/server/tools/registry";
import {executeTools} from "@/server/tools/executor";
import {nanoid} from "nanoid";
import {db} from "@/db/client";
import {agents, messages} from "@/db/schema";
import {eq} from "drizzle-orm";
import {eventBus} from "@/server/event-bus";
import {withSpan} from "@/server/tracing/span";
import {workspaceRoot} from "@/server/tools/workspace";

// 工具调用轮数硬上限，防止工具死循环烧 token
const MAX_TOOL_ROUNDS = 8

// dispatch_to_agent 的执行入口：把 task 落库为一条 user 消息（方案 A，群里可追溯），再跑子 agent
function dispatchChild(conversationId: string, parentMessageId: string, depth: number) {
    return async (agentId: string, task: string): Promise<string> => {
        const taskMessageId = nanoid()
        await db.insert(messages).values({
            id: taskMessageId,
            conversationId,
            role: 'user',
            agentId: null,
            parts: [{ type: 'text', content: task }],
            status: 'complete',
            parentMessageId,
            mentionedAgentIds: [agentId],
            runId: null,
            createdAt: new Date(),
        })
        eventBus.emit({ type: 'message.start', conversationId, timestamp: Date.now(), messageId: taskMessageId, agentId: '', runId: '' })
        eventBus.emit({ type: 'message.end', conversationId, timestamp: Date.now(), messageId: taskMessageId })
        return runAgent(conversationId, agentId, taskMessageId, depth + 1)
    }
}

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

// 返回 agent 的最终文本（最后一轮的文字产出），供线 3 dispatch_to_agent 收集子 agent 结果
// depth：0=顶层 agent（可派发）；>0=被派发的子 agent（一级护栏：不再注入 dispatch）
export async function runAgent(
    conversationId: string,
    agentId: string,
    triggerMessageId: string,
    depth = 0,
): Promise<string> {
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
    //3.查对话历史 + 群聊 attribution：其他 agent 的发言带 [名字] 前缀，当前 agent 的发言算 assistant
    const dbMessages = await db.select().from(messages).where(eq(messages.conversationId, conversationId))
    const allAgents = await db.select().from(agents)
    const nameById = new Map(allAgents.map((a) => [a.id, a.name]))

    const extractText = (parts: unknown) =>
        (parts as Array<{ type: string; content?: string }>)
            .filter((p) => p.type === 'text')
            .map((p) => p.content ?? '')
            .join('')

    const history: AdapterMessage[] = dbMessages
        .map((m): AdapterMessage | null => {
            const text = extractText(m.parts)
            if (!text) return null
            if (m.role === 'system') return { role: 'system', content: text }
            if (m.role === 'user') return { role: 'user', content: text }
            // 当前 agent 自己的发言算 assistant；其他 agent 作为上下文输入并标注来源
            if (m.agentId === agentId) return { role: 'assistant', content: text }
            const speaker = (m.agentId && nameById.get(m.agentId)) || 'Agent'
            return { role: 'user', content: `[${speaker}]: ${text}` }
        })
        .filter((m): m is AdapterMessage => m !== null)

    //4.选适配器，解析凭证，准备工具集/中止控制器/消息 id
    const credentials = await resolveCredentials(agent.modelConfigId)
    const adapter = getAdapter(credentials.adapterName)
    // 一级护栏：子 agent（depth>0）不暴露 dispatch_to_agent，防止无限自派发
    const resolved = resolveTools(agent.toolNames)
    const tools = depth > 0 ? resolved.filter((t) => t.name !== 'dispatch_to_agent') : resolved
    const toolSchemas = tools.length ? toToolSchemas(tools) : undefined
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

    // 一条 agent 消息跨轮累积交错 parts（text / tool_use / tool_result）
    const parts: MessagePart[] = []
    let partIndex = -1
    let finalText = ''

    // TTFT：从进入执行到首个 text.delta 的毫秒数；首个工具调用同理（衡量 agent 决策延迟）
    const runStartedAt = Date.now()
    let ttftMs: number | undefined
    let totalTextLen = 0

    try {
      return await withSpan(`agent:${agent.name}`, 'agent', async (span) => {
        span.update({ input: { agentId, triggerMessageId, depth } })
        //6.agentic loop：每轮消费一次 adapter 流，收集 tool.call；无工具调用则收敛
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            let roundText = ''
            const roundToolCalls: AdapterToolCall[] = []

            for await (const event of adapter.run({
                systemPrompt: agent.systemPrompt,
                messages: history,
                model: credentials.model,
                apiKey: credentials.apiKey,
                baseURL: credentials.baseURL,
                tools: toolSchemas,
            }, controller.signal)) {
                switch (event.type) {
                    case 'thinking.start': {
                        partIndex++
                        const part: MessagePart = { type: 'thinking', content: '' }
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

                    case 'thinking.delta': {
                        if (ttftMs === undefined) ttftMs = Date.now() - runStartedAt
                        const part = parts[partIndex]
                        if (part && part.type === 'thinking') part.content += event.text
                        eventBus.emit({
                            type: "part.delta",
                            conversationId,
                            timestamp: Date.now(),
                            messageId,
                            partIndex,
                            delta: { type: 'thinking.append', text: event.text },
                        })
                        break
                    }

                    case 'thinking.end': {
                        eventBus.emit({
                            type: "part.end",
                            conversationId,
                            timestamp: Date.now(),
                            messageId,
                            partIndex,
                        })
                        break
                    }

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
                        if (ttftMs === undefined) ttftMs = Date.now() - runStartedAt
                        totalTextLen += event.text.length
                        const part = parts[partIndex]
                        if (part && part.type === 'text') part.content += event.text
                        roundText += event.text
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

                    case 'tool.call': {
                        // tool_use 作为一个 part 一次性推送（无 delta），与 tool_result 共用 part.start 通道
                        partIndex++
                        const part: MessagePart = {
                            type: 'tool_use',
                            callId: event.callId,
                            toolName: event.toolName,
                            args: event.args,
                        }
                        parts[partIndex] = part
                        eventBus.emit({
                            type: "part.start",
                            conversationId,
                            timestamp: Date.now(),
                            messageId,
                            partIndex,
                            part,
                        })
                        roundToolCalls.push({ callId: event.callId, toolName: event.toolName, args: event.args })
                        break
                    }

                    case 'done':
                        break
                }
            }

            // 本轮没有工具调用 → agent 已给出最终答复，收敛
            if (roundToolCalls.length === 0) {
                finalText = roundText
                break
            }

            //6a.回灌本轮 assistant（含 toolCalls），再执行工具、回灌 tool 结果，进入下一轮
            history.push({ role: 'assistant', content: roundText, toolCalls: roundToolCalls })

            const toolCalls = roundToolCalls.map((tc) => ({ callId: tc.callId, toolName: tc.toolName, args: tc.args }))
            const results = await executeTools(toolCalls, {
                conversationId,
                runId,
                signal: controller.signal,
                depth,
                // 一级护栏：仅顶层 agent（depth=0）可派发子 agent
                dispatch: depth === 0 ? dispatchChild(conversationId, triggerMessageId, depth) : undefined,
                // Phase 4：注入该 agent 可查的 KB 范围，rag_search 无法越权
                knowledgeBaseIds: agent.knowledgeBaseIds,
                // Phase 5：注入会话沙箱根，fs_read/fs_write 路径校验以此为基准
                workspaceRoot: workspaceRoot(conversationId),
            })

            for (const res of results) {
                const toolName = roundToolCalls.find((tc) => tc.callId === res.callId)?.toolName ?? ''
                partIndex++
                const part: MessagePart = {
                    type: 'tool_result',
                    callId: res.callId,
                    result: res.result,
                    isError: res.isError,
                }
                parts[partIndex] = part
                eventBus.emit({
                    type: "part.start",
                    conversationId,
                    timestamp: Date.now(),
                    messageId,
                    partIndex,
                    part,
                })
                history.push({ role: 'tool', callId: res.callId, toolName, result: res.result, isError: res.isError })
            }
        }

        //7.持久化 agent 消息，发出 message.end 与 run.end
        // thinking part 只在流式时展示，不入库（省空间；历史回灌 LLM 时也不该带思考）
        await db.insert(messages).values({
            id: messageId,
            conversationId,
            role: 'agent',
            agentId,
            parts: parts.filter((p) => p.type !== 'thinking'),
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

        // 延迟指标写入 span：TTFT（首字节）、端到端、生成速率（tokens/s 以字符近似）
        const totalMs = Date.now() - runStartedAt
        span.update({
          output: { finalText },
          metadata: {
            ttftMs,
            totalMs,
            outputChars: totalTextLen,
            charsPerSec: totalMs > 0 ? Math.round((totalTextLen / totalMs) * 1000) : undefined,
          },
        })
        return finalText
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
