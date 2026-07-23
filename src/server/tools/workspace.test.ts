/**
 * resolveInWorkspace 安全校验单测 —— 越界必须被拒绝。用 node:test + tsx 跑，不引测试框架。
 * 运行：pnpm exec tsx --test src/server/tools/workspace.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { resolveExistingInWorkspace, resolveInWorkspace, resolveWritableInWorkspace, workspaceRoot } from './workspace'

const root = path.join(process.cwd(), 'data', 'workspaces', 'conv-1')

// ─── 合法路径：落在沙箱内 ───────────────────────────────
test('允许沙箱内相对路径', () => {
  assert.equal(resolveInWorkspace(root, 'a.txt'), path.join(root, 'a.txt'))
  assert.equal(resolveInWorkspace(root, 'src/foo.ts'), path.join(root, 'src', 'foo.ts'))
  assert.equal(resolveInWorkspace(root, './x/y.md'), path.join(root, 'x', 'y.md'))
})

test('允许内部 ../ 只要最终仍在沙箱内', () => {
  assert.equal(resolveInWorkspace(root, 'src/../a.txt'), path.join(root, 'a.txt'))
})

// ─── 越界路径：必须抛错 ─────────────────────────────────
test('拒绝 ../ 逃逸到父目录', () => {
  assert.throws(() => resolveInWorkspace(root, '../secret.txt'), /越界/)
  assert.throws(() => resolveInWorkspace(root, '../../etc/passwd'), /越界/)
  assert.throws(() => resolveInWorkspace(root, 'src/../../../x'), /越界/)
})

test('拒绝绝对路径', () => {
  assert.throws(() => resolveInWorkspace(root, '/etc/passwd'), /越界/)
})

// ─── Windows 特有：盘符 / UNC ───────────────────────────
test('拒绝 Windows 盘符与 UNC（仅 win32 生效）', () => {
  if (process.platform !== 'win32') return
  assert.throws(() => resolveInWorkspace(root, 'C:\\Windows\\system32'), /越界/)
  assert.throws(() => resolveInWorkspace(root, '\\\\server\\share'), /越界/)
})

test('会话 ID 必须是单个安全路径段', () => {
  assert.throws(() => workspaceRoot('../escape'), /会话 ID/)
  assert.throws(() => workspaceRoot('a/b'), /会话 ID/)
  assert.doesNotThrow(() => workspaceRoot('conversation_123-abc'))
})

test('真实路径校验拒绝符号链接或目录联接逃逸', async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agenthub-workspace-'))
  const sandbox = path.join(base, 'sandbox')
  const outside = path.join(base, 'outside')
  await fs.mkdir(sandbox)
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret')

  try {
    const link = path.join(sandbox, 'link')
    try {
      await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('当前 Windows 环境不允许创建目录联接')
        return
      }
      throw error
    }

    await assert.rejects(resolveExistingInWorkspace(sandbox, 'link/secret.txt'), /符号链接|目录联接/)
    await assert.rejects(resolveWritableInWorkspace(sandbox, 'link/new.txt'), /符号链接|目录联接/)
  } finally {
    await fs.rm(base, { recursive: true, force: true })
  }
})

test('可写路径逐级创建真实目录', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agenthub-writable-'))
  try {
    const target = await resolveWritableInWorkspace(base, 'nested/deep/file.txt')
    assert.equal(target, path.join(base, 'nested', 'deep', 'file.txt'))
    assert.equal((await fs.stat(path.dirname(target))).isDirectory(), true)
  } finally {
    await fs.rm(base, { recursive: true, force: true })
  }
})

test('拒绝把工作区根本身设为链接', async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agenthub-root-link-'))
  const outside = path.join(base, 'outside')
  const linkedRoot = path.join(base, 'linked-root')
  await fs.mkdir(outside)
  try {
    try {
      await fs.symlink(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('当前 Windows 环境不允许创建目录联接')
        return
      }
      throw error
    }
    await assert.rejects(resolveWritableInWorkspace(linkedRoot, 'file.txt'), /工作区根/)
  } finally {
    await fs.rm(base, { recursive: true, force: true })
  }
})
