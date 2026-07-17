import type { ModelConfigView } from '@/shared/types'

// 脱敏：剥掉 apiKey 明文，只留 hasApiKey 标记。所有发往前端的 ModelConfig 必须过此函数。
// 入参取 DB 行形状（adapterName 为 string、createdAt 为 Date/number 均可），输出统一收敛为 ModelConfigView。
type WithApiKey = {
  id: string
  name: string
  adapterName: string
  provider: string | null
  modelId: string | null
  baseURL: string | null
  apiKey: string | null
  isDefault: boolean
  createdAt: Date | number
}

export function toModelConfigView(config: WithApiKey): ModelConfigView {
  const { apiKey, adapterName, createdAt, ...rest } = config
  return {
    ...rest,
    adapterName: adapterName as ModelConfigView['adapterName'],
    provider: config.provider as ModelConfigView['provider'],
    createdAt: createdAt instanceof Date ? createdAt.getTime() : createdAt,
    hasApiKey: !!apiKey,
  }
}
