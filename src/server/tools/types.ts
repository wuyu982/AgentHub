/**
 * 工具系统类型契约（L3）—— 独立于 shared/types.ts 的 MessagePart/StreamEvent。
 * 工具是纯粹的能力单元；执行、注入 ctx、兜错都由 ToolExecutor 负责。
 */

// LLM tools 字段够用的最小 JSON Schema 结构，不引 json-schema-to-ts
export interface JSONSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

// 喂给 adapter 的工具 schema 形状（②的 AdapterRequest.tools 会消费）
export interface ToolSchema {
  name: string
  description: string
  parameters: JSONSchema
}

// 派发一个子 agent 执行任务，返回子 agent 的最终文本。由 runner 注入，工具层不直接依赖 runner。
export type DispatchFn = (agentId: string, task: string) => Promise<string>

// 由 ToolExecutor 注入；工具不自己抓全局状态
export interface ToolContext {
  conversationId: string
  messageId: string // 产出工具调用的 agent 消息 id；create_artifact 落库归属用
  runId: string
  signal: AbortSignal // 复用 runAgent 的中止信号，工具内长操作必须尊重
  depth: number // 0 = 顶层 agent；>0 = 被 dispatch 的子 agent
  dispatch?: DispatchFn // 线 3：dispatch_to_agent 的执行入口；depth>0 时不提供（一级派发护栏）
  knowledgeBaseIds?: string[] // Phase 4：rag_search 可查的 KB 范围（runner 注入，LLM 无法越权）
  workspaceRoot?: string // Phase 5：会话沙箱根目录（runner 注入），fs_read/fs_write 路径校验的基准
}

// 工具永远成功返回；失败包成 isError，不 throw 进 loop
export interface ToolResult {
  result: unknown // 落进 MessagePart.tool_result.result
  isError: boolean // 对应 MessagePart.tool_result.isError
}

// 审批判定：'skip'=无需审批直跑；'approve'=需人工审批（summary 给用户看批的是什么）；'deny'=硬拒不执行
export type ApprovalCheck =
  | { verdict: 'skip' }
  | { verdict: 'approve'; summary: string }
  | { verdict: 'deny'; reason: string }

export interface ToolDef {
  name: string // 唯一标识，对应 Agent.toolNames 里的字符串
  description: string // 给 LLM 看的用途说明
  parameters: JSONSchema // 直接喂 adapter 的 tools 字段
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult> // args 不可信，内部自行 narrow
  // 可选：执行前的审批判定（human-in-the-loop）。不实现 = 永远直跑。executor 据此决定是否挂起
  checkApproval?(args: unknown): ApprovalCheck
}

// runner 从 adapter 的 tool.call 收集来的调用
export interface ToolCall {
  callId: string
  toolName: string
  args: unknown
}
