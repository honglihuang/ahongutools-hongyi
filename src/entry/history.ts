// 翻译历史：window.services.localStore 键 'history'（本机，不同步），新的在前，最多 HISTORY_LIMIT 条。
// prefs.history 为 false 时不写。
import { getPrefs } from './prefs.ts'

export const HISTORY_KEY = 'history'
export const HISTORY_LIMIT = 200

export interface HistoryEntry {
  source: string
  text: string
  providerId: string
  target: string
  at: number
}

export async function readHistory(): Promise<HistoryEntry[]> {
  const list = await window.services.localStore.get<HistoryEntry[]>(HISTORY_KEY)
  return Array.isArray(list) ? list : []
}

// 读-改-写串行，避免两次并发写入互相覆盖。
let queue: Promise<unknown> = Promise.resolve()

/** 同一条原文 + 目标语言只留最新一条。 */
export function addHistory(entry: HistoryEntry): Promise<void> {
  if (!getPrefs().history) return Promise.resolve()
  const task = queue.then(async () => {
    const rest = (await readHistory()).filter((e) => !(e.source === entry.source && e.target === entry.target))
    await window.services.localStore.set(HISTORY_KEY, [entry, ...rest].slice(0, HISTORY_LIMIT))
  })
  queue = task.catch(() => {})
  return task
}
