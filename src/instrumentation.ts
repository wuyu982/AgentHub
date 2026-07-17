/**
 * Next.js 启动钩子 —— 服务端进程启动时初始化 Langfuse OTel tracing。
 * 仅在 nodejs runtime 执行（edge runtime 不支持 OTel Node SDK）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initTracing } = await import('@/server/tracing/langfuse')
    initTracing()
  }
}
