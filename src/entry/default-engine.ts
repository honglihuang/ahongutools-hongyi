// 默认引擎：「翻译并粘回」「文件翻译」「截图翻译」与搜索框直出缓存共用一个引擎，只由这里的 resolveDefaultEngine 决定。
// 规则：设置页选了某个引擎且它仍启用 → 用它；否则（自动，或所选引擎已停用、已删除）→ 第一个启用的自定义引擎（配置顺序，
// 与设置页列表一致）；没有 → uTools AI；uTools AI 也停用 → undefined，由调用方报「没有可用的翻译引擎」。
// 范围与设置页引擎列表相同（uTools AI + 设置页能添加的类型）；只读 id、provider、enabled，不碰 key。
import { isEngineType } from '../settings/logic.ts'
import { UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'

/** 设置页的选择：utools.dbStorage 里存 providerId（随账号同步，与上游配置一致）；没有这个键 = 自动。 */
export const ENGINE_CHOICE_KEY = 'hongyi.defaultEngine'

export interface EngineCandidate {
  id: string
  provider: string
  enabled: boolean
}

/** 可以当默认引擎的行：启用，且是 uTools AI 或设置页管理的引擎类型。保持配置顺序。 */
export function usableEngines<T extends EngineCandidate>(providers: readonly T[]): T[] {
  return providers.filter((p) => p.enabled && (p.id === UTOOLS_AI_PROVIDER_ID || isEngineType(p.provider)))
}

/** choice 为 null = 自动。 */
export function resolveDefaultEngine<T extends EngineCandidate>(providers: readonly T[], choice: string | null): T | undefined {
  const usable = usableEngines(providers)
  return (
    usable.find((p) => p.id === choice) ??
    usable.find((p) => p.id !== UTOOLS_AI_PROVIDER_ID) ??
    usable.find((p) => p.id === UTOOLS_AI_PROVIDER_ID)
  )
}

export function getEngineChoice(): string | null {
  const v = window.utools.dbStorage.getItem(ENGINE_CHOICE_KEY)
  return typeof v === 'string' && v !== '' ? v : null
}

/** null = 改回自动。 */
export function setEngineChoice(providerId: string | null): void {
  if (providerId === null) window.utools.dbStorage.removeItem(ENGINE_CHOICE_KEY)
  else window.utools.dbStorage.setItem(ENGINE_CHOICE_KEY, providerId)
}
