export function resolveCreatedDefault(requestedDefault: boolean, hasDefault: boolean): boolean {
  return requestedDefault || !hasDefault
}

export type DefaultUpdateDecision =
  | { allowed: false; error: string }
  | { allowed: true; isDefault: boolean | undefined; clearOtherDefaults: boolean }

export function resolveUpdatedDefault(
  existingIsDefault: boolean,
  requestedDefault: boolean | undefined,
  hasDefault: boolean,
): DefaultUpdateDecision {
  if (existingIsDefault && requestedDefault === false) {
    return { allowed: false, error: '当前默认模型配置不能直接取消，请先将另一条配置设为默认' }
  }
  if (requestedDefault === true) {
    return { allowed: true, isDefault: true, clearOtherDefaults: true }
  }
  if (!hasDefault) {
    return { allowed: true, isDefault: true, clearOtherDefaults: false }
  }
  return { allowed: true, isDefault: requestedDefault, clearOtherDefaults: false }
}
