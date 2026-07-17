import { db } from './client'
import { agents, modelConfigs } from './schema'
import { DEFAULT_MODEL_ID } from '@/shared/constants'

// 默认模型配置：Agent 未指定 modelConfigId 时的兜底。凭证走 env 由 adapter 兜底，此处只定模型。
const DEFAULT_MODEL_CONFIG_ID = 'model_default'

const defaultModelConfig = {
  id: DEFAULT_MODEL_CONFIG_ID,
  name: '默认模型',
  adapterName: 'openai-compatible' as const,
  provider: null,
  modelId: DEFAULT_MODEL_ID,
  baseURL: null,
  apiKey: null,
  isDefault: true,
  createdAt: new Date(),
}

const builtinAgents = [
  {
    id: 'agent_assistant',
    name: '通用助手',
    avatar: '🤖',
    description: '通用对话助手，可以回答各种问题',
    systemPrompt: '你是一个有用的AI助手。请用简洁、准确的方式回答用户的问题。需要当前时间或日期时，调用 get_current_time 工具获取。',
    modelConfigId: DEFAULT_MODEL_CONFIG_ID,
    toolNames: ['get_current_time'] as string[],
    isBuiltin: true,
    isOrchestrator: false,
    createdAt: new Date(),
  },
  {
    id: 'agent_coder',
    name: '代码专家',
    avatar: '👨‍💻',
    description: '擅长编程和代码审查的AI助手',
    systemPrompt: '你是一个资深软件工程师。请提供高质量的代码建议，遵循最佳实践，代码要简洁、可读、可维护。',
    modelConfigId: DEFAULT_MODEL_CONFIG_ID,
    toolNames: [] as string[],
    isBuiltin: true,
    isOrchestrator: false,
    createdAt: new Date(),
  },
  {
    id: 'agent_orchestrator',
    name: '协调者',
    avatar: '🎯',
    description: '多Agent群聊的任务协调者',
    systemPrompt:
      '你是一个多Agent协作的协调者。分析用户任务，拆解成子任务，用 dispatch_to_agent 工具把每个子任务派发给会话内最合适的 Agent（传入其 agentId 和具体任务描述）。' +
      '收到各 Agent 的回答后，汇总成一个连贯的最终答复给用户。不要自己直接完成需要专业 Agent 处理的任务。',
    modelConfigId: DEFAULT_MODEL_CONFIG_ID,
    toolNames: ['dispatch_to_agent'] as string[],
    isBuiltin: true,
    isOrchestrator: true,
    createdAt: new Date(),
  },
]

async function seed() {
  console.log('🌱 Seeding database...')

  await db.insert(modelConfigs).values(defaultModelConfig).onConflictDoNothing()

  for (const agent of builtinAgents) {
    await db.insert(agents).values(agent).onConflictDoNothing()
  }

  console.log(`✅ Seeded 1 model config + ${builtinAgents.length} built-in agents`)
}

seed().catch(console.error)
