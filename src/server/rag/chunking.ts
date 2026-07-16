/**
 * 分块（L3）—— 固定大小分块，按字符数切，带软边界与重叠。
 * 纯函数、无副作用、无 I/O，便于单测。
 *
 * 策略：固定分块。以 CHUNK_SIZE 为目标步进，在目标位置附近优先找自然边界
 * （段落 > 换行 > 句末标点）软切，避免拦腰截断句子；相邻块重叠 CHUNK_OVERLAP
 * 防上下文丢失。其余策略（recursive/semantic）留作后续，此处不预留抽象（YAGNI）。
 */

const CHUNK_SIZE = 500 // 每块目标字符数
const CHUNK_OVERLAP = 50 // 相邻块重叠字符数
const BOUNDARY_SEARCH_WINDOW = 100 // 在目标位置前多少字符内回退找边界

// 优先级从高到低的边界匹配：段落 > 换行 > 句末标点
const BOUNDARY_PATTERNS = ['\n\n', '\n', '。', '！', '？', '. ', '! ', '? ']

// 在 [from, to) 区间内，从后往前找最靠后的自然边界；返回边界结束位置（切点），找不到返回 -1
function findBoundary(text: string, from: number, to: number): number {
  let best = -1
  for (const p of BOUNDARY_PATTERNS) {
    const idx = text.lastIndexOf(p, to - 1)
    if (idx >= from && idx + p.length > best) best = idx + p.length
  }
  return best
}

// 把长文本切成固定大小的块（保序，去除纯空白块）
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  if (normalized.length <= CHUNK_SIZE) return [normalized]

  const chunks: string[] = []
  let start = 0

  while (start < normalized.length) {
    const hardEnd = Math.min(start + CHUNK_SIZE, normalized.length)

    // 未到文本末尾时，在目标位置附近回退找自然边界软切
    let end = hardEnd
    if (hardEnd < normalized.length) {
      const boundary = findBoundary(normalized, hardEnd - BOUNDARY_SEARCH_WINDOW, hardEnd)
      if (boundary > start) end = boundary
    }

    const piece = normalized.slice(start, end).trim()
    if (piece) chunks.push(piece)

    if (end >= normalized.length) break
    // 下一块起点回退 overlap，保留上下文衔接
    start = Math.max(end - CHUNK_OVERLAP, start + 1)
  }

  return chunks
}
