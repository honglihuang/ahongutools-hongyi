// 单页内的视图状态（不用 react-router）：当前视图、进入时的 action、是否分离窗口。
// 不依赖 React，视图外壳用 useSyncExternalStore 订阅。
import type { EnterAction, OpenView, ViewId } from './contract.ts'
import { ACTION_FEATURE_PREFIX, FEATURE_CODES } from './contract.ts'

export interface NavState {
  /** null = 插件已退出（视图卸载，在途请求随之取消）或尚未进入。 */
  view: ViewId | null
  action?: EnterAction
  detached: boolean
  /** 每次切换加一，视图外壳用它当 key，让同一视图的新一次进入重新挂载。 */
  seq: number
}

const VIEW_BY_CODE: Record<string, ViewId> = {
  [FEATURE_CODES.translate]: 'hub',
  [FEATURE_CODES.paste]: 'paste',
  [FEATURE_CODES.shot]: 'shot',
  [FEATURE_CODES.file]: 'file',
  [FEATURE_CODES.settings]: 'settings',
  [FEATURE_CODES.probe]: 'probe',
  [FEATURE_CODES.actions]: 'action',
  [FEATURE_CODES.vocab]: 'vocab',
}

const VIEW_IDS: readonly ViewId[] = ['hub', 'paste', 'shot', 'file', 'settings', 'probe', 'action', 'vocab']

export const isViewId = (v: unknown): v is ViewId => VIEW_IDS.includes(v as ViewId)

/** 自定义动作的动态 code（ACTION_FEATURE_PREFIX 开头）打开动作视图；其余 plugin.json 之外的 code 不会出现，万一出现，落到主界面。 */
export const viewForCode = (code: string): ViewId =>
  VIEW_BY_CODE[code] ?? (code.startsWith(ACTION_FEATURE_PREFIX) ? 'action' : 'hub')

let state: NavState = { view: null, detached: false, seq: 0 }
const listeners = new Set<() => void>()

function update(patch: Partial<NavState>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export const getNavState = (): NavState => state

export function subscribeNav(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const openView: OpenView = (view, action) => update({ view, action, seq: state.seq + 1 })

export function closeView(): void {
  update({ view: null, action: undefined, seq: state.seq + 1 })
}

export function setDetached(detached: boolean): void {
  if (state.detached !== detached) update({ detached })
}

/** 只给测试用：恢复初始状态。 */
export function resetNavForTest(): void {
  state = { view: null, detached: false, seq: 0 }
  listeners.clear()
}
