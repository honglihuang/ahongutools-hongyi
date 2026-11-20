// AI 动作的存储与动态指令对账（上游接线，不依赖 React）。
// - 动作本身：上游配置 selectionToolbar.customActions（随配置同步）。这里只在启动写默认动作时直接写存储；设置页经 writeConfigAtom 写。
// - 哪些动作注册成 uTools 指令：本机 window.services.localStore 键 COMMANDS_KEY（不同步，默认一个都不开）。
// - 对账：应有 = 本机开启且仍存在的动作；实际 = utools.getFeatures() 里带 ACTION_FEATURE_PREFIX 的。每个 uTools 调用单独捕获，失败记下给设置页显示。
import type { Config } from '@/types/config/config'
import { storage } from '#imports'
import { configSchema } from '@/types/config/config'
import { CONFIG_STORAGE_KEY } from '@/utils/constants/config'
import { getRandomUUID } from '@/utils/crypto-polyfill'
import { setLocalConfig } from '@/utils/config/storage'
import { ACTION_FEATURE_PREFIX } from '../entry/contract.ts'
import { type CustomAction, diffFeatures, expectedCommandActions, type SeedResult, seedDefaultActions } from './logic.ts'

export const COMMANDS_KEY = 'action-commands'
export const SEEDED_FLAG_KEY = 'hongyi.actions.seeded'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * 存储里的配置能通过 configSchema 时返回它；没有配置或校验失败返回 null。
 * 不用上游 getLocalConfig：它在校验失败时返回 DEFAULT_CONFIG，基于它写回会冲掉用户的引擎，对账也会误删全部指令。
 */
async function readValidConfig(): Promise<Config | null> {
  const raw = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  if (!raw) return null
  const parsed = configSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function readStoredActions(): Promise<CustomAction[] | null> {
  return (await readValidConfig())?.selectionToolbar.customActions ?? null
}

export function seedActions(): Promise<SeedResult> {
  return seedDefaultActions({
    readActions: readStoredActions,
    async writeActions(actions) {
      const config = await readValidConfig()
      if (!config) throw new Error('配置无效，没有写入默认动作')
      await setLocalConfig({ ...config, selectionToolbar: { ...config.selectionToolbar, customActions: actions } })
    },
    getFlag: () => window.utools.dbStorage.getItem(SEEDED_FLAG_KEY) === true,
    setFlag: () => window.utools.dbStorage.setItem(SEEDED_FLAG_KEY, true),
    uuid: getRandomUUID,
  })
}

export async function getCommandIds(): Promise<string[]> {
  const v = await window.services.localStore.get<unknown>(COMMANDS_KEY)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export async function setCommandEnabled(id: string, enabled: boolean): Promise<void> {
  const rest = (await getCommandIds()).filter((x) => x !== id)
  await window.services.localStore.set(COMMANDS_KEY, enabled ? [...rest, id] : rest)
}

// 最近一次对账的失败（给设置页显示）；空数组 = 没有失败。
let reconcileErrors: string[] = []
const listeners = new Set<() => void>()

export const getReconcileErrors = (): string[] => reconcileErrors

export function subscribeReconcile(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish(errors: string[]): void {
  reconcileErrors = errors
  for (const l of listeners) l()
}

async function reconcileOnce(): Promise<void> {
  const errors: string[] = []
  const actions = await readStoredActions()
  if (actions === null) {
    // 配置读不出来时不知道哪些动作还在：不增不删。
    publish(['配置无效，没有更新 uTools 指令'])
    return
  }
  let actual: string[] = []
  try {
    actual = window.utools.getFeatures().map((f) => f.code).filter((c) => c.startsWith(ACTION_FEATURE_PREFIX))
  } catch (e) {
    errors.push(`读取已注册的指令失败：${errorText(e)}`)
  }
  const expected = expectedCommandActions(actions, await getCommandIds())
  const { set, remove } = diffFeatures(expected, actual)
  set.forEach((feature, i) => {
    try {
      // 7.8.0 插件侧 setFeature 是 ipcSendSync：失败时主进程不抛错，而是把 Error 当返回值；成功返回 true。
      const result: unknown = window.utools.setFeature(feature)
      if (result !== true) {
        const message = typeof result === 'object' && result !== null && 'message' in result ? String(result.message) : ''
        errors.push(`注册指令「${expected[i]!.name}」失败${message ? `：${message}` : ''}`)
      }
    } catch (e) {
      errors.push(`注册指令「${expected[i]!.name}」失败：${errorText(e)}`)
    }
  })
  for (const code of remove) {
    try {
      if (window.utools.removeFeature(code) === false) errors.push(`删除指令 ${code} 失败`)
    } catch (e) {
      errors.push(`删除指令 ${code} 失败：${errorText(e)}`)
    }
  }
  publish(errors)
}

let queue: Promise<void> = Promise.resolve()

/** 串行执行，避免两次对账交错。自身不抛错：失败记进 getReconcileErrors()。 */
export function reconcileCommands(): Promise<void> {
  const task = queue.then(reconcileOnce).catch((e: unknown) => publish([`更新 uTools 指令失败：${errorText(e)}`]))
  queue = task
  return task
}
