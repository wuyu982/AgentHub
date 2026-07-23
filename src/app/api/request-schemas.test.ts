import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createAgentBodySchema,
  createConversationBodySchema,
  createModelConfigBodySchema,
  updateAgentBodySchema,
  updateModelConfigBodySchema,
  updateSettingsBodySchema,
} from './request-schemas'

test('Agent 创建请求规范化名称并填充安全默认值', () => {
  const result = createAgentBodySchema.parse({ name: '  Reviewer  ' })
  assert.deepEqual(result, {
    name: 'Reviewer',
    avatar: '🤖',
    description: '',
    systemPrompt: '',
    modelConfigId: null,
    toolNames: [],
    knowledgeBaseIds: [],
  })
})

test('Agent 请求拒绝错误类型、受保护字段与空更新', () => {
  assert.equal(createAgentBodySchema.safeParse({ name: 123 }).success, false)
  assert.equal(createAgentBodySchema.safeParse({ name: 'x', isBuiltin: true }).success, false)
  assert.equal(updateAgentBodySchema.safeParse({}).success, false)
  assert.equal(updateAgentBodySchema.safeParse({ toolNames: 'bash' }).success, false)
})

test('Conversation 请求只接受受支持的模式与 Agent ID 数组', () => {
  assert.equal(createConversationBodySchema.safeParse({ mode: 'broadcast' }).success, false)
  assert.equal(createConversationBodySchema.safeParse({ agentIds: 'agent-1' }).success, false)
  assert.deepEqual(createConversationBodySchema.parse({}), { title: '', mode: 'single', agentIds: [] })
})

test('ModelConfig 请求校验 adapter/provider/布尔类型', () => {
  assert.equal(createModelConfigBodySchema.safeParse({ name: 'x', adapterName: 'unknown' }).success, false)
  assert.equal(createModelConfigBodySchema.safeParse({ name: 'x', provider: 'unknown' }).success, false)
  assert.equal(createModelConfigBodySchema.safeParse({ name: 'x', isDefault: 'true' }).success, false)
  assert.equal(updateModelConfigBodySchema.safeParse({}).success, false)
  assert.equal(updateModelConfigBodySchema.safeParse({ apiKey: '' }).success, true)
})

test('Settings 请求拒绝未知键、非字符串值与空更新', () => {
  assert.equal(updateSettingsBodySchema.safeParse({ arbitrary_key: 'value' }).success, false)
  assert.equal(updateSettingsBodySchema.safeParse({ embedding_model: 123 }).success, false)
  assert.equal(updateSettingsBodySchema.safeParse({}).success, false)
  assert.equal(updateSettingsBodySchema.safeParse({ rerank_model: 'bge-reranker' }).success, true)
})
