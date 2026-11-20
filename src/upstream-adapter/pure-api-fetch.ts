// 上游 DeepL / DeepLX（utils/host/translate/api/deepl.ts、deeplx.ts）直接调全局 fetch；
// vite.config.ts 在构建期把这两处改成调用这里：请求走 preload 桥接，只发往该 provider 已登记的 origin（不替换全局 fetch）。
import { createBridgeFetch } from '../bridge/fetch.ts'

const SECRET_PLACEHOLDER = '{{secret:'

export function pureApiFetch(providerId: string): typeof fetch {
  const bridgeFetch = createBridgeFetch(providerId)
  return async (input, init) => {
    // preload 只替换请求头里的 key 占位符；DeepLX 的 {{apiKey}} 写法会把占位符拼进 URL，真实 key 发不出去。
    if (typeof input === 'string' && input.includes(SECRET_PLACEHOLDER)) {
      throw new Error(`provider "${providerId}" puts its API key in the URL, which uTools cannot fill in; remove {{apiKey}} from the service address`)
    }
    return bridgeFetch(input, init)
  }
}

/**
 * 上游按 key 是否以 `:fx` 结尾选 DeepL 免费 / 付费端点；渲染层只有 key 的占位符，看不到后缀。
 * 配置了 baseURL（保存 key 时登记的 origin）就用它的 origin，否则沿用上游判断。
 */
export function deeplBaseURL(baseURL: string | undefined, apiKey: string, upstream: (apiKey: string) => string): string {
  return baseURL ? new URL(baseURL).origin : upstream(apiKey)
}
