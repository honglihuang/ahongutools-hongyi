// 翻译并粘回（决策 M3'）：先显示预览，用户回车才粘回。单引擎（配置的默认引擎）。
// 方向与主界面相同（决策 L9）：不传 target，由 translateOnce 按 resolveTargetLang + HongyiPrefs.direction 决定；不再用 prefs.pasteTarget。
// 翻译失败只显示错误，不粘也不复制任何东西。
import type { TranslateOnce } from './contract.ts'
import { type PasteOutcome, pasteBackAfterHide } from './deliver.ts'

export type PasteState =
  | { kind: 'translating' }
  | { kind: 'ready'; text: string; target: string; providerId: string }
  | { kind: 'error'; message: string }
  | { kind: 'pasting' }
  | { kind: 'done'; outcome: PasteOutcome }

export async function translateForPaste(
  source: string,
  translate: TranslateOnce,
  signal?: AbortSignal,
): Promise<PasteState> {
  if (source.trim() === '') return { kind: 'error', message: '没有收到要翻译的文本' }
  try {
    const r = await translate(source, { signal })
    if (r.text.trim() === '') return { kind: 'error', message: '翻译结果为空' }
    return { kind: 'ready', text: r.text, target: r.target, providerId: r.providerId }
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

/** 预览窗里的引擎说明：按 providerId 在当前配置里找名字；找不到（已删除）就显示 id。 */
export function pasteEngineLine(providers: readonly { id: string; name: string }[], providerId: string): string {
  return `翻译引擎：「${providers.find((p) => p.id === providerId)?.name ?? providerId}」`
}

/** 回车：只有 ready 状态才粘回；其余状态什么都不做。 */
export async function confirmPaste(
  state: PasteState,
  paste: (text: string) => Promise<PasteOutcome> = pasteBackAfterHide,
): Promise<PasteState> {
  if (state.kind !== 'ready') return state
  return { kind: 'done', outcome: await paste(state.text) }
}
