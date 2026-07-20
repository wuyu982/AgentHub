/**
 * 工具注册表（L3）—— name → ToolDef 映射，按 Agent.toolNames 解析工具集。
 * 显式集中注册（非 import 即注册），避免 Next.js 热重载下重复注册。
 */
import type { ToolDef, ToolSchema } from '@/server/tools/types'
import { getCurrentTime } from '@/server/tools/builtin/get-current-time'
import { dispatchToAgent } from '@/server/tools/builtin/dispatch-to-agent'
import { ragSearch } from '@/server/tools/builtin/rag-search'
import { fsRead } from '@/server/tools/builtin/fs-read'
import { fsWrite } from '@/server/tools/builtin/fs-write'
import { createArtifact } from '@/server/tools/builtin/create-artifact'

const REGISTRY = new Map<string, ToolDef>()

function registerTool(tool: ToolDef): void {
  if (REGISTRY.has(tool.name)) throw new Error(`工具重复注册: ${tool.name}`)
  REGISTRY.set(tool.name, tool)
}

// ─── 集中注册点 ───────────────────────────────────────────
registerTool(getCurrentTime)
registerTool(dispatchToAgent)
registerTool(ragSearch)
registerTool(fsRead)
registerTool(fsWrite)
registerTool(createArtifact)

export function getTool(name: string): ToolDef | undefined {
  return REGISTRY.get(name)
}

// 列出所有已注册工具的元数据，供 Agent 配置界面做多选
export function listTools(): { name: string; description: string }[] {
  return Array.from(REGISTRY.values()).map((t) => ({ name: t.name, description: t.description }))
}

// 按 Agent.toolNames 解析实际工具集；未注册的 name warn 跳过，不整体崩掉
export function resolveTools(toolNames: string[]): ToolDef[] {
  const resolved: ToolDef[] = []
  for (const name of toolNames) {
    const tool = REGISTRY.get(name)
    if (!tool) {
      console.warn(`[tools] Agent 配置了未注册的工具，已跳过: ${name}`)
      continue
    }
    resolved.push(tool)
  }
  return resolved
}

// 转成 adapter 要的 schema（②的 AdapterRequest.tools 会消费）
export function toToolSchemas(tools: ToolDef[]): ToolSchema[] {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
}
