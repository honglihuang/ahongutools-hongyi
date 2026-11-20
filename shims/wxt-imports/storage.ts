// `#imports` 的 storage：同接口（getItem/setItem/getMeta/setMeta/watch），底层是 utools.dbStorage。
// 上游 key 形如 `local:config`；去掉区域前缀后加 `rf:` 存。meta 存在 `rf:<key>$`，与 WXT 相同。
// 存的是上游 Config（用户配置，允许随 uTools 同步）；API key 在写入前由 secret-guard 换成占位符。
import { guardSecrets } from '../../src/upstream-adapter/secret-guard.ts'

type Listener = (newValue: unknown, oldValue: unknown) => void

const listeners = new Map<string, Set<Listener>>()

function dbKey(key: string): string {
  const sep = key.indexOf(':')
  const area = sep === -1 ? '' : key.slice(0, sep)
  if (area !== 'local') throw new Error(`storage area "${area}" is not supported in uTools: ${key}`)
  return `rf:${key.slice(sep + 1)}`
}

function read(key: string): unknown {
  const value = window.utools.dbStorage.getItem(key)
  return value === undefined ? null : value
}

function write(storageKey: string, value: unknown): void {
  const oldValue = read(dbKey(storageKey))
  if (value === null || value === undefined) window.utools.dbStorage.removeItem(dbKey(storageKey))
  else window.utools.dbStorage.setItem(dbKey(storageKey), value)
  for (const listener of listeners.get(storageKey) ?? []) listener(value ?? null, oldValue)
}

export const storage = {
  async getItem<T>(key: string): Promise<T | null> {
    return read(dbKey(key)) as T | null
  },
  async setItem<T>(key: string, value: T): Promise<void> {
    write(key, await guardSecrets(key, value))
  },
  async removeItem(key: string): Promise<void> {
    write(key, null)
  },
  async getMeta<T extends Record<string, unknown>>(key: string): Promise<T> {
    return (read(`${dbKey(key)}$`) ?? {}) as T
  },
  async setMeta<T extends Record<string, unknown>>(key: string, meta: Partial<T>): Promise<void> {
    const merged = { ...((read(`${dbKey(key)}$`) ?? {}) as T), ...meta }
    window.utools.dbStorage.setItem(`${dbKey(key)}$`, merged)
  },
  watch<T>(key: string, callback: (newValue: T | null, oldValue: T | null) => void): () => void {
    dbKey(key)
    const set = listeners.get(key) ?? new Set<Listener>()
    listeners.set(key, set)
    set.add(callback as Listener)
    return () => set.delete(callback as Listener)
  },
}
