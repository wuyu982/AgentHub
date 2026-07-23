/**
 * Workspace 沙箱（L3）—— 每个会话一个文件目录，fs 工具的安全收口。
 * 不落 DB：root 从 conversationId 推导（会话 : 沙箱严格 1:1，无需持久化元数据）。
 * 所有 fs_read/fs_write 的路径都经过词法边界、真实路径与链接检查（CLAUDE.md §5.3）。
 */
import path from 'node:path'
import fs from 'node:fs/promises'

// 会话沙箱根：data/workspaces/{conversationId}（data/ 已 gitignore，与 SQLite 同基准 cwd）
export function workspaceRoot(conversationId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(conversationId)) {
    throw new Error(`会话 ID 不能用于工作区路径: ${conversationId}`)
  }
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

function assertContained(root: string, target: string, userPath: string): void {
  const rel = path.relative(root, target)
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`真实路径越界，拒绝访问沙箱外: ${userPath}`)
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function realWorkspaceRoot(root: string): Promise<string> {
  const info = await fs.lstat(root)
  if (info.isSymbolicLink()) throw new Error('工作区根不能是符号链接或目录联接')
  if (!info.isDirectory()) throw new Error('工作区根不是目录')
  return fs.realpath(root)
}

// 读取已有路径：除词法边界外，再拒绝符号链接/目录联接并校验 realpath，避免链接逃逸。
export async function resolveExistingInWorkspace(root: string, userPath: string): Promise<string> {
  const lexicalRoot = path.resolve(root)
  const resolved = resolveInWorkspace(lexicalRoot, userPath)
  const rel = path.relative(lexicalRoot, resolved)
  const realRoot = await realWorkspaceRoot(lexicalRoot)
  let current = lexicalRoot

  for (const segment of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    const info = await fs.lstat(current)
    if (info.isSymbolicLink()) {
      throw new Error(`路径包含符号链接或目录联接，拒绝访问: ${userPath}`)
    }
  }

  const realTarget = await fs.realpath(resolved)
  assertContained(realRoot, realTarget, userPath)
  return realTarget
}

// 写入新路径：逐级检查并创建父目录，任何已有的链接节点都会被拒绝。
export async function resolveWritableInWorkspace(root: string, userPath: string): Promise<string> {
  const lexicalRoot = path.resolve(root)
  const resolved = resolveInWorkspace(lexicalRoot, userPath)
  const rel = path.relative(lexicalRoot, resolved)
  const segments = rel.split(path.sep).filter(Boolean)
  if (segments.length === 0) throw new Error(`写入路径必须指向工作区内的文件: ${userPath}`)

  await ensureWorkspace(lexicalRoot)
  const realRoot = await realWorkspaceRoot(lexicalRoot)
  let currentLexical = lexicalRoot
  let currentReal = realRoot

  for (const segment of segments.slice(0, -1)) {
    const nextLexical = path.join(currentLexical, segment)
    try {
      const info = await fs.lstat(nextLexical)
      if (info.isSymbolicLink()) {
        throw new Error(`写入路径包含符号链接或目录联接，拒绝访问: ${userPath}`)
      }
      if (!info.isDirectory()) throw new Error(`写入路径的父级不是目录: ${userPath}`)
    } catch (error) {
      if (!isNotFound(error)) throw error
      await fs.mkdir(nextLexical)
    }

    const nextReal = await fs.realpath(nextLexical)
    assertContained(realRoot, nextReal, userPath)
    currentLexical = nextLexical
    currentReal = nextReal
  }

  const filename = segments.at(-1)!
  const targetLexical = path.join(currentLexical, filename)
  try {
    const info = await fs.lstat(targetLexical)
    if (info.isSymbolicLink()) {
      throw new Error(`写入目标是符号链接或目录联接，拒绝覆盖: ${userPath}`)
    }
    if (info.isDirectory()) throw new Error(`写入路径是目录而非文件: ${userPath}`)
    const realTarget = await fs.realpath(targetLexical)
    assertContained(realRoot, realTarget, userPath)
    return realTarget
  } catch (error) {
    if (!isNotFound(error)) throw error
    return path.join(currentReal, filename)
  }
}

// 懒创建沙箱目录（首次 fs 调用时）；已存在则无操作
export async function ensureWorkspace(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true })
  await realWorkspaceRoot(path.resolve(root))
}
