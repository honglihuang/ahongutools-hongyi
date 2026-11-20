// 配置写进 utools.dbStorage（会同步上云）之前的最后一道关：providersConfig 里的 apiKey 只能是 SecretRef 占位符。
// 遇到真实 key：先经 window.services.secrets.set 存进 preload（本机文件），再把配置里的值换成 ref。
// 存不进去（没有 baseURL、origin 不被允许、preload 缺失）就整次写入失败，绝不把明文落进 dbStorage。
import type { SecretRef } from '../bridge/contract.ts'

const CONFIG_KEY = 'local:config'
const SECRET_REF_RE = /^\{\{secret:[^{}]+\}\}$/

export function isSecretRef(value: unknown): value is SecretRef {
  return typeof value === 'string' && SECRET_REF_RE.test(value)
}

interface ProviderRow {
  id: string
  apiKey?: string
  baseURL?: string
  url?: string
  [key: string]: unknown
}

/** key 要登记到哪个 origin：openai-compatible 类用 baseURL，open-responses 用 url。 */
function keyTarget(row: ProviderRow): string {
  const target = row.baseURL ?? row.url
  if (!target) {
    throw new Error(`provider "${row.id}" 没有 baseURL，无法安全保存 API key；请先填写服务地址`)
  }
  return target
}

async function moveKeyToSecrets(row: ProviderRow): Promise<ProviderRow> {
  const key = row.apiKey
  if (key === undefined || key === '' || isSecretRef(key)) return row
  const services = window.services
  if (!services?.secrets) throw new Error('preload 未提供 secrets，拒绝把 API key 写进同步存储')
  await services.secrets.set(row.id, key, keyTarget(row))
  return { ...row, apiKey: services.secrets.ref(row.id) }
}

/** storage.setItem 调用它：只处理 config 键，其余原样返回。 */
export async function guardSecrets<T>(storageKey: string, value: T): Promise<T> {
  if (storageKey !== CONFIG_KEY || value === null || typeof value !== 'object') return value
  const config = value as { providersConfig?: ProviderRow[] }
  if (!Array.isArray(config.providersConfig)) return value
  const providersConfig = await Promise.all(config.providersConfig.map(moveKeyToSecrets))
  return { ...config, providersConfig } as T
}
