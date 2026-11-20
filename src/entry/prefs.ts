// 洪译偏好（HongyiPrefs）读写：utools.dbStorage 键 PREFS_KEY（同步，随 uTools 数据同步）。
// 存储里的值可能缺字段、类型不对或来自旧版本：逐字段与默认值合并，不认识的字段丢掉。
import type { GetPrefs, HongyiPrefs, SetPrefs } from './contract.ts'
import { PREFS_KEY } from './contract.ts'

/** 契约注释里写明的默认值。 */
export const DEFAULT_PREFS: HongyiPrefs = {
  direction: { native: 'cmn', foreign: 'eng' },
  mainPush: { mode: 'smart', prefix: 'fy ' },
  pasteTarget: 'eng',
  history: true,
}

const MODES: readonly HongyiPrefs['mainPush']['mode'][] = ['smart', 'any', 'off']

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const nonEmpty = (v: unknown, fallback: string) => (typeof v === 'string' && v !== '' ? v : fallback)

export function mergePrefs(stored: unknown): HongyiPrefs {
  const s = isObject(stored) ? stored : {}
  const direction = isObject(s.direction) ? s.direction : {}
  const mainPush = isObject(s.mainPush) ? s.mainPush : {}
  const mode = MODES.find((m) => m === mainPush.mode) ?? DEFAULT_PREFS.mainPush.mode
  return {
    direction: {
      native: nonEmpty(direction.native, DEFAULT_PREFS.direction.native),
      foreign: nonEmpty(direction.foreign, DEFAULT_PREFS.direction.foreign),
    },
    // 前缀允许是空串（smart 模式只靠字符检测）。
    mainPush: { mode, prefix: typeof mainPush.prefix === 'string' ? mainPush.prefix : DEFAULT_PREFS.mainPush.prefix },
    pasteTarget: nonEmpty(s.pasteTarget, DEFAULT_PREFS.pasteTarget),
    history: typeof s.history === 'boolean' ? s.history : DEFAULT_PREFS.history,
  }
}

export const getPrefs: GetPrefs = () => mergePrefs(window.utools.dbStorage.getItem(PREFS_KEY))

/** 顶层浅合并（契约 Partial<HongyiPrefs>）：子对象要整块传。 */
export const setPrefs: SetPrefs = (patch) => {
  window.utools.dbStorage.setItem(PREFS_KEY, mergePrefs({ ...getPrefs(), ...patch }))
}
