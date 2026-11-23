// 配置写进 utools.dbStorage（会同步上云）之前的最后一道关：providersConfig 里的 apiKey 只能是 SecretRef 占位符。
// 同步配置不是授权入口：有真实 key 的导入或写入必须失败，用户须在洪译设置里单独保存。
import type { SecretRef } from '../bridge/contract.ts'

const CONFIG_KEY = 'local:config'
const SECRET_REF_RE = /^\{\{secret:[^{}]+\}\}$/

export function isSecretRef(value: unknown): value is SecretRef {
  return typeof value === 'string' && SECRET_REF_RE.test(value)
}

interface ProviderRow {
  apiKey?: string
}

/** storage.setItem 调用它：只处理 config 键，其余原样返回。 */
export async function guardSecrets<T>(storageKey: string, value: T): Promise<T> {
  if (storageKey !== CONFIG_KEY || value === null || typeof value !== 'object') return value
  const config = value as { providersConfig?: ProviderRow[] }
  if (!Array.isArray(config.providersConfig)) return value
  if (config.providersConfig.some(({ apiKey }) => apiKey !== undefined && apiKey !== '' && !isSecretRef(apiKey))) {
    throw new Error('配置含明文 API key，请在「洪译设置」单独保存引擎')
  }
  return value
}
