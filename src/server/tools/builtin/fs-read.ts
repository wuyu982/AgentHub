/**
 * fs_read —— 读取会话工作区内的文件。路径经过词法、realpath 与链接检查（§5.3）。
 * 超过 256KB 截断并提示（防止撑爆 LLM 上下文）。
 */
import { z } from 'zod'
import fs from 'node:fs/promises'
import type { ToolDef } from '@/server/tools/types'
import { resolveExistingInWorkspace } from '@/server/tools/workspace'

const MAX_READ_BYTES = 256 * 1024

const argsSchema = z.object({
  path: z.string().min(1),
})

export const fsRead: ToolDef = {
  name: 'fs_read',
  description:
    '读取当前会话工作区内的文件内容。path 为相对工作区根的路径（如 "src/index.ts"），不能用绝对路径或 ".." 越界。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对工作区根的文件路径，如 "notes.md" 或 "src/app.ts"' },
    },
    required: ['path'],
  },
  async execute(args, ctx) {
    const parsed = argsSchema.safeParse(args)
    if (!parsed.success) {
      return { result: `参数非法: ${parsed.error.message}`, isError: true }
    }
    if (!ctx.workspaceRoot) {
      return { result: '当前上下文无工作区，无法读文件', isError: true }
    }

    let abs: string
    try {
      abs = await resolveExistingInWorkspace(ctx.workspaceRoot, parsed.data.path)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { result: `文件不存在: ${parsed.data.path}`, isError: true }
      return { result: err instanceof Error ? err.message : String(err), isError: true }
    }

    try {
      const buf = await fs.readFile(abs)
      const truncated = buf.byteLength > MAX_READ_BYTES
      const content = buf.subarray(0, MAX_READ_BYTES).toString('utf8')
      return {
        result: truncated
          ? { path: parsed.data.path, content, truncated: true, totalBytes: buf.byteLength }
          : { path: parsed.data.path, content },
        isError: false,
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { result: `文件不存在: ${parsed.data.path}`, isError: true }
      if (code === 'EISDIR') return { result: `路径是目录而非文件: ${parsed.data.path}`, isError: true }
      return { result: `读取失败: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }
  },
}
