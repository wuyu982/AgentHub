import type { ToolDef } from '@/server/tools/types'

// 线 2 验证闭环用的 mock 工具：无参、纯函数、无副作用
export const getCurrentTime: ToolDef = {
  name: 'get_current_time',
  description: '获取当前时间。当用户询问现在几点、今天日期时使用。',
  parameters: { type: 'object', properties: {}, required: [] },
  async execute() {
    return { result: { iso: new Date().toISOString() }, isError: false }
  },
}
