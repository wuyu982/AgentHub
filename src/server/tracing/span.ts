/**
 * 埋点安全封装（L3 基建）—— 让业务代码用统一 API 埋点，未启用 Langfuse 时零成本透传。
 * 未启用时不加载 @langfuse/tracing 的 span 逻辑，仅执行原函数并喂一个 no-op observation。
 */
import { isTracingEnabled } from '@/server/tracing/langfuse'
import { startActiveObservation, type LangfuseObservationType } from '@langfuse/tracing'

// 业务侧只依赖 update；no-op 与真实 span 都满足此形状，屏蔽 tracing 是否启用
export interface TraceSpan {
  update(attrs: { input?: unknown; output?: unknown; metadata?: Record<string, unknown> }): unknown
}

const noopSpan: TraceSpan = { update: () => noopSpan }

// startActiveObservation 按 asType 拆成多个重载，联合类型无法命中任一重载。
// 封装层只用到 observation 的 update，故用统一调用签名绕过重载解析（收窄到本模块，不外泄）。
type StartObservationFn = (
  name: string,
  fn: (span: TraceSpan) => unknown,
  options: { asType: LangfuseObservationType },
) => Promise<unknown>

// 以 name/asType 包裹一段异步逻辑为 observation；未启用 tracing 时直接执行 fn(noopSpan)。
export async function withSpan<T>(
  name: string,
  asType: LangfuseObservationType,
  fn: (span: TraceSpan) => Promise<T>,
): Promise<T> {
  if (!isTracingEnabled) return fn(noopSpan)
  const start = startActiveObservation as unknown as StartObservationFn
  return start(name, (span) => fn(span), { asType }) as Promise<T>
}
