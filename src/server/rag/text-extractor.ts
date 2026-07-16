/**
 * 文本提取（L3）—— 调 Apache Tika Server 从各类文档提取纯文本。
 * 走 REST（PUT /tika），Node 侧零依赖。换提取器只改此文件（职责单一）。
 */

// 从文档字节提取纯文本。contentType 传原始 MIME 帮 Tika 识别格式（可空，Tika 会自动探测）。
export async function extractText(
  bytes: Uint8Array,
  contentType?: string,
  signal?: AbortSignal
): Promise<string> {
  const tikaUrl = process.env.TIKA_URL
  if (!tikaUrl) throw new Error('文本提取失败：环境变量 TIKA_URL 未配置')

  let res: Response
  try {
    res = await fetch(`${tikaUrl}/tika`, {
      method: 'PUT',
      headers: {
        Accept: 'text/plain', // 要纯文本，不要 Tika 默认的 HTML
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      body: bytes,
      signal,
    })
  } catch (e) {
    throw new Error(`文本提取失败：无法连接 Tika Server（${tikaUrl}）—— ${(e as Error).message}`)
  }

  if (!res.ok) {
    throw new Error(`文本提取失败：Tika 返回 ${res.status} ${res.statusText}`)
  }

  return (await res.text()).trim()
}
