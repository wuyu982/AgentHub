import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCreatedDefault, resolveUpdatedDefault } from './model-config-default'

test('第一条 ModelConfig 自动成为默认', () => {
  assert.equal(resolveCreatedDefault(false, false), true)
  assert.equal(resolveCreatedDefault(true, false), true)
})

test('已有默认项时尊重创建请求', () => {
  assert.equal(resolveCreatedDefault(false, true), false)
  assert.equal(resolveCreatedDefault(true, true), true)
})

test('当前默认项不能直接取消', () => {
  const result = resolveUpdatedDefault(true, false, true)
  assert.equal(result.allowed, false)
})

test('切换默认项要求清理旧默认', () => {
  assert.deepEqual(resolveUpdatedDefault(false, true, true), {
    allowed: true,
    isDefault: true,
    clearOtherDefaults: true,
  })
})

test('历史数据没有默认项时自动修复', () => {
  assert.deepEqual(resolveUpdatedDefault(false, undefined, false), {
    allowed: true,
    isDefault: true,
    clearOtherDefaults: false,
  })
})
