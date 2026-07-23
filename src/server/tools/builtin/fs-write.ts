/**
 * fs_write —— 写入会话工作区内的文件（覆盖写）。路径经过词法、realpath 与链接检查（§5.3）。
 * 自动创建父目录；首次写触发沙箱懒创建。
 */
import { z } from 'zod'
import fs from 'node:fs/promises'
import type { ToolDef } from '@/server/tools/types'
import { resolveWritableInWorkspace } from '@/server/tools/workspace'

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
  // fs_write 恒需审批：写文件有副作用，执行前弹确认（human-in-the-loop）
  checkApproval(args) {
    const parsed = argsSchema.safeParse(args)
    if (!parsed.success) return { verdict: 'skip' } // 参数非法交给 execute 报错
    const bytes = Buffer.byteLength(parsed.data.content, 'utf8')
    return { verdict: 'approve', summary: `写入文件 ${parsed.data.path}（${bytes} 字节）` }
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
      abs = await resolveWritableInWorkspace(ctx.workspaceRoot, parsed.data.path)
    } catch (err) {
      return { result: err instanceof Error ? err.message : String(err), isError: true }
    }

    try {
      const bytesWritten = Buffer.byteLength(parsed.data.content, 'utf8')
      await fs.writeFile(abs, parsed.data.content, 'utf8')
      return { result: { path: parsed.data.path, bytesWritten }, isError: false }
    } catch (err) {
      return { result: `写入失败: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }
  },
}
