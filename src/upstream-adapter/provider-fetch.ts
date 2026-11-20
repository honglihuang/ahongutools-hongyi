// 给上游 AI SDK provider 注入 fetch 选项（不替换全局 fetch）。
// utools.ai 的虚拟端点走 createUtoolsAiFetch；其余 provider 走 preload 桥接 fetch（只发往已登记的 origin）。
import { createBridgeFetch } from '../bridge/fetch.ts'
import { UTOOLS_AI_BASE_URL } from '../engine/contract.ts'
import { createUtoolsAiFetch } from '../engine/utools-ai-fetch.ts'
import { UTOOLS_AI_DEFAULT_MODEL, UTOOLS_AI_PROVIDER_ID } from './default-providers.ts'

/** 请求体里的占位模型 id 换成「不指定」，交给 utools.ai 选默认模型。 */
function withDefaultModel(upstreamFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (typeof init?.body !== 'string') return upstreamFetch(input, init)
    const body = JSON.parse(init.body) as { model?: unknown }
    if (body.model !== UTOOLS_AI_DEFAULT_MODEL) return upstreamFetch(input, init)
    delete body.model
    return upstreamFetch(input, { ...init, body: JSON.stringify(body) })
  }
}

let utoolsAiFetch: typeof fetch | undefined

export function fetchForProvider(providerId: string, baseURL: string | undefined): typeof fetch {
  if (providerId === UTOOLS_AI_PROVIDER_ID || baseURL === UTOOLS_AI_BASE_URL) {
    if (providerId !== UTOOLS_AI_PROVIDER_ID || baseURL !== UTOOLS_AI_BASE_URL) {
      throw new Error(`provider "${providerId}" must use ${UTOOLS_AI_BASE_URL} to reach utools.ai`)
    }
    utoolsAiFetch ??= withDefaultModel(createUtoolsAiFetch())
    return utoolsAiFetch
  }
  return createBridgeFetch(providerId)
}
