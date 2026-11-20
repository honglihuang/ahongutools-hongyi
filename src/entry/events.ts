// uTools 生命周期事件与 OPEN_VIEW_EVENT → 视图切换。只注册一次（events.md：「每个插件应用仅需注册一次事件监听」）。
import type { EnterAction } from './contract.ts'
import { OPEN_VIEW_EVENT } from '../bridge/contract.ts'
import { closeView, isViewId, openView, setDetached, viewForCode } from './nav.ts'

export interface EventHost {
  onPluginEnter(cb: (action: EnterAction) => void): void
  onPluginOut(cb: (isKill: boolean) => void): void
  onPluginDetach(cb: () => void): void
}

let registered = false

export function registerEntryEvents(host: EventHost, target: EventTarget): void {
  if (registered) return
  registered = true
  host.onPluginEnter((action) => openView(viewForCode(action.code), action))
  // 退出（到后台或结束）时卸载当前视图：各视图与上游翻译卡片在卸载时 abort 在途请求。
  host.onPluginOut(() => closeView())
  host.onPluginDetach(() => setDetached(true))
  target.addEventListener(OPEN_VIEW_EVENT, (e) => {
    const view = (e as CustomEvent<unknown>).detail
    if (isViewId(view)) openView(view)
  })
}

/** 只给测试用。 */
export function resetEventsForTest(): void {
  registered = false
}
