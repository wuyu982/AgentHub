// 从 agentId 稳定哈希出一个色相，给群聊里每个 agent 一个可辨识的强调色。
// 返回可直接用于内联 style 的 HSL 字符串；亮/暗由 lightness 两档适配。

function hashHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 360
}

export interface AgentAccent {
  hue: number
  solid: string // 头像底色 / 强调实心
  text: string // 名字文字色
  border: string // 气泡左边框
  soft: string // 气泡淡背景
}

export function agentAccent(agentId: string | null): AgentAccent {
  const hue = agentId ? hashHue(agentId) : 220
  return {
    hue,
    solid: `hsl(${hue} 65% 55%)`,
    text: `hsl(${hue} 55% 45%)`,
    border: `hsl(${hue} 60% 55%)`,
    soft: `hsl(${hue} 60% 55% / 0.10)`,
  }
}
