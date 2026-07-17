/**
 * Langfuse 可观测性初始化（L3 基建）—— 自托管 Langfuse 的 OpenTelemetry 接入。
 * 全链路 tracing 埋在 L3（agent-runner / retrieval），不碰 L2 adapter，守住「adapter 只做事件翻译」。
 *
 * 未配置 LANGFUSE_* 时整体降级为 no-op：isTracingEnabled=false，埋点包装器直接透传，不阻断业务。
 */
import { NodeSDK } from '@opentelemetry/sdk-node'
import { LangfuseSpanProcessor } from '@langfuse/otel'

// 仅当 public+secret 都配了才启用；缺任一则 tracing 全程 no-op（本地未起 Langfuse 时不报错）
export const isTracingEnabled = Boolean(
  process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY,
)

let started = false

// 幂等启动 OTel SDK：Next.js dev 下模块可能多次求值，重复 start 会报错，故加 started 卫兵
export function initTracing(): void {
  if (!isTracingEnabled || started) return
  started = true

  const sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL,
      }),
    ],
  })
  sdk.start()
}
