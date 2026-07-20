/**
 * Workspace 沙箱（L3）—— 每个会话一个文件目录，fs 工具的安全收口。
 * 不落 DB：root 从 conversationId 推导（会话 : 沙箱严格 1:1，无需持久化元数据）。
 * 所有 fs_read/fs_write 的路径都必须经 resolveInWorkspace 校验，杜绝越界（CLAUDE.md §5.3）。
 */
import path from 'node:path'
import fs from 'node:fs/promises'

// 会话沙箱根：data/workspaces/{conversationId}（data/ 已 gitignore，与 SQLite 同基准 cwd）
export function workspaceRoot(conversationId: string): string {
  return path.join(process.cwd(), 'data', 'workspaces', conversationId)
}

// 解析用户路径到沙箱内绝对路径；任何越界（../ 逃逸、绝对路径、盘符/UNC）都抛错。
// path.resolve 先吃掉 ../ 与 .，再用 path.relative 判断是否仍落在 root 子树内。
export function resolveInWorkspace(root: string, userPath: string): string {
  const resolved = path.resolve(root, userPath)
  const rel = path.relative(root, resolved)
  // rel 以 '..' 开头 = 跳出了 root；isAbsolute = userPath 是别的盘符/UNC，relative 无法相对化
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`路径越界，拒绝访问沙箱外: ${userPath}`)
  }
  return resolved
}

// 懒创建沙箱目录（首次 fs 调用时）；已存在则无操作
export async function ensureWorkspace(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true })
}
