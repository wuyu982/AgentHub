/**
 * resolveInWorkspace 安全校验单测 —— 越界必须被拒绝。用 node:test + tsx 跑，不引测试框架。
 * 运行：pnpm exec tsx --test src/server/tools/workspace.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { resolveInWorkspace } from './workspace'

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
