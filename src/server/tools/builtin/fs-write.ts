/**
 * fs_write —— 写入会话工作区内的文件（覆盖写）。路径经 resolveInWorkspace 校验，无法越界（§5.3）。
 * 自动创建父目录；首次写触发沙箱懒创建。
 */
import { z } from 'zod'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { ToolDef } from '@/server/tools/types'
import { resolveInWorkspace, ensureWorkspace } from '@/server/tools/workspace'

const argsSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

export const fsWrite: ToolDef = {
  name: 'fs_write',
  description:
    '写入文件到当前会话工作区（已存在则覆盖）。path 为相对工作区根的路径（如 "src/index.ts"），不能用绝对路径或 ".." 越界。父目录会自动创建。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对工作区根的文件路径，如 "notes.md" 或 "src/app.ts"' },
      content: { type: 'string', description: '要写入的完整文件内容' },
    },
    required: ['path', 'content'],
  },
  async execute(args, ctx) {
    const parsed = argsSchema.safeParse(args)
    if (!parsed.success) {
      return { result: `参数非法: ${parsed.error.message}`, isError: true }
    }
    if (!ctx.workspaceRoot) {
      return { result: '当前上下文无工作区，无法写文件', isError: true }
    }

    let abs: string
    try {
      abs = resolveInWorkspace(ctx.workspaceRoot, parsed.data.path)
    } catch (err) {
      return { result: err instanceof Error ? err.message : String(err), isError: true }
    }

    try {
      await ensureWorkspace(ctx.workspaceRoot)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      const bytesWritten = Buffer.byteLength(parsed.data.content, 'utf8')
      await fs.writeFile(abs, parsed.data.content, 'utf8')
      return { result: { path: parsed.data.path, bytesWritten }, isError: false }
    } catch (err) {
      return { result: `写入失败: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }
  },
}
