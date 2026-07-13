import { db } from './client'
import { agents } from './schema'
import { nanoid } from 'nanoid'

const builtinAgents = [
  {
    id: 'agent_assistant',
    name: '通用助手',
    avatar: '🤖',
    description: '通用对话助手，可以回答各种问题',
    systemPrompt: '你是一个有用的AI助手。请用简洁、准确的方式回答用户的问题。',
    adapterName: 'openai-compatible' as const,
    modelProvider: null,
    modelId: null,
    toolNames: [] as string[],
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
    adapterName: 'openai-compatible' as const,
    modelProvider: null,
    modelId: null,
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
    systemPrompt: '你是一个多Agent协作的协调者。你的职责是分析用户的任务，拆解成子任务，并分配给合适的Agent执行。请用结构化的方式组织任务。',
    adapterName: 'openai-compatible' as const,
    modelProvider: null,
    modelId: null,
    toolNames: [] as string[],
    isBuiltin: true,
    isOrchestrator: true,
    createdAt: new Date(),
  },
]

async function seed() {
  console.log('🌱 Seeding database...')

  for (const agent of builtinAgents) {
    await db.insert(agents).values(agent).onConflictDoNothing()
  }

  console.log(`✅ Seeded ${builtinAgents.length} built-in agents`)
}

seed().catch(console.error)
