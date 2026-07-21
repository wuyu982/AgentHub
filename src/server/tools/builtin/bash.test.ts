/**
 * validateCommand 安全校验单测 —— 白名单 + 禁 shell 元字符。用 node:test + tsx 跑，不引测试框架。
 * 运行：pnpm exec tsx --test src/server/tools/builtin/bash.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateCommand } from './bash'

// ─── 白名单内：直接执行（ok）──────────────────────────
test('白名单内命令 → ok', () => {
  assert.equal(validateCommand('ls -la').verdict, 'ok')
  assert.equal(validateCommand('node script.js').verdict, 'ok')
  assert.equal(validateCommand('pnpm install').verdict, 'ok')
  assert.equal(validateCommand('  cat notes.md  ').verdict, 'ok')
})

// ─── 硬拒黑名单：deny（不给审批）──────────────────────
test('不可逆危险命令 → deny', () => {
  assert.equal(validateCommand('rm -rf /').verdict, 'deny')
  assert.equal(validateCommand('sudo reboot').verdict, 'deny')
  assert.equal(validateCommand('shutdown now').verdict, 'deny')
  assert.equal(validateCommand('chmod 777 x').verdict, 'deny')
})

// ─── 白名单外、非硬拒：needs_approval ─────────────────
test('其余命令 → needs_approval', () => {
  assert.equal(validateCommand('curl http://x.com').verdict, 'needs_approval')
  assert.equal(validateCommand('mv a b').verdict, 'needs_approval')
  assert.equal(validateCommand('git status').verdict, 'needs_approval')
})

// ─── shell 元字符：一律 deny（防注入/链式）────────────
test('管道 → deny', () => {
  assert.equal(validateCommand('cat x | grep y').verdict, 'deny')
})
test('重定向 → deny', () => {
  assert.equal(validateCommand('echo hi > f.txt').verdict, 'deny')
  assert.equal(validateCommand('cat < f.txt').verdict, 'deny')
})
test('命令链 → deny', () => {
  assert.equal(validateCommand('ls && rm x').verdict, 'deny')
  assert.equal(validateCommand('ls; rm x').verdict, 'deny')
})
test('命令替换 → deny', () => {
  assert.equal(validateCommand('echo $(rm -rf /)').verdict, 'deny')
  assert.equal(validateCommand('echo `whoami`').verdict, 'deny')
})
test('环境变量前缀 → deny', () => {
  assert.equal(validateCommand('FOO=bar ls').verdict, 'deny')
})

// ─── 边界 ───────────────────────────────────────────────
test('空命令 → deny', () => {
  assert.equal(validateCommand('   ').verdict, 'deny')
})
