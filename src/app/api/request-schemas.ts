import { z } from 'zod'
import type { AdapterName, ModelProvider } from '@/shared/types'

const adapterNames = ['openai-compatible', 'anthropic', 'mock'] as const satisfies readonly AdapterName[]
const modelProviders = [
  'openai',
  'anthropic',
  'deepseek',
  'volcano-ark',
  'openai-compatible',
] as const satisfies readonly ModelProvider[]

const requiredText = z.string().trim().min(1)
const idList = z.array(requiredText)

const agentEditableShape = {
  name: requiredText,
  avatar: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  modelConfigId: requiredText.nullable(),
  toolNames: idList,
  knowledgeBaseIds: idList,
}

export const createAgentBodySchema = z
  .object({
    name: agentEditableShape.name,
    avatar: agentEditableShape.avatar.default('🤖'),
    description: agentEditableShape.description.default(''),
    systemPrompt: agentEditableShape.systemPrompt.default(''),
    modelConfigId: agentEditableShape.modelConfigId.default(null),
    toolNames: agentEditableShape.toolNames.default([]),
    knowledgeBaseIds: agentEditableShape.knowledgeBaseIds.default([]),
  })
  .strict()

export const updateAgentBodySchema = z
  .object(agentEditableShape)
  .strict()
  .partial()
  .refine((body) => Object.keys(body).length > 0, '至少提供一个可更新字段')

export const createConversationBodySchema = z
  .object({
    title: z.string().trim().default(''),
    mode: z.enum(['single', 'group']).default('single'),
    agentIds: idList.default([]),
  })
  .strict()

const modelConfigEditableShape = {
  name: requiredText,
  adapterName: z.enum(adapterNames),
  provider: z.enum(modelProviders).nullable(),
  modelId: z.string().nullable(),
  baseURL: z.string().nullable(),
  apiKey: z.string().nullable(),
  isDefault: z.boolean(),
}

export const createModelConfigBodySchema = z
  .object({
    name: modelConfigEditableShape.name,
    adapterName: modelConfigEditableShape.adapterName.default('openai-compatible'),
    provider: modelConfigEditableShape.provider.default(null),
    modelId: modelConfigEditableShape.modelId.default(null),
    baseURL: modelConfigEditableShape.baseURL.default(null),
    apiKey: modelConfigEditableShape.apiKey.default(null),
    isDefault: modelConfigEditableShape.isDefault.default(false),
  })
  .strict()

export const updateModelConfigBodySchema = z
  .object(modelConfigEditableShape)
  .strict()
  .partial()
  .refine((body) => Object.keys(body).length > 0, '至少提供一个可更新字段')

export const updateSettingsBodySchema = z
  .object({
    embedding_api_key: z.string().optional(),
    embedding_base_url: z.string().optional(),
    embedding_model: z.string().optional(),
    rerank_api_key: z.string().optional(),
    rerank_base_url: z.string().optional(),
    rerank_model: z.string().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, '至少提供一个设置项')
