// 读上游翻译卡片的结果，不改上游组件：卡片用 useMutation（mutationKey ['translate', providerId]），
// 结果在共用 QueryClient 的 MutationCache 里，这里从外面读。
import type { MutationCache } from '@tanstack/react-query'

interface MutationLike {
  options: { mutationKey?: readonly unknown[] }
  state: { status: string; data: unknown; variables: unknown }
}

/**
 * 某个卡片对当前请求（timestamp）的译文；还在翻译、失败或被丢弃（上游对过期响应返回 undefined）时为 null。
 * 按 timestamp 匹配：缓存里还留着上一次进入时的结果，不能拿来复制。
 */
export function latestResult(mutations: readonly MutationLike[], providerId: string, timestamp: number): string | null {
  const own = mutations.filter(
    (m) =>
      m.options.mutationKey?.[0] === 'translate' &&
      m.options.mutationKey[1] === providerId &&
      (m.state.variables as { timestamp?: number } | undefined)?.timestamp === timestamp,
  )
  const last = own.at(-1)
  if (!last || last.state.status !== 'success') return null
  return typeof last.state.data === 'string' && last.state.data !== '' ? last.state.data : null
}

export interface FirstResult {
  source: string
  text: string
  providerId: string
  target: string
}

/**
 * 每个翻译请求（上游 TranslateRequest，按 timestamp 区分）第一个成功的卡片结果回调一次。
 * accept 只认某些卡片（如默认引擎）：其余卡片的结果不算、也不占这个请求的名额。
 * 用于写搜索框直出缓存与历史。返回取消订阅函数。
 */
export function onFirstResult(
  cache: MutationCache,
  cb: (r: FirstResult) => void,
  accept: (providerId: string) => boolean = () => true,
): () => void {
  const done = new Set<number>()
  return cache.subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    const m = event.mutation as unknown as MutationLike
    const key = m.options.mutationKey
    const req = m.state.variables as { inputText?: string; targetLanguage?: string; timestamp?: number } | undefined
    const text = m.state.data
    if (key?.[0] !== 'translate' || typeof text !== 'string' || text === '' || !req?.inputText) return
    if (!accept(String(key[1]))) return
    if (req.timestamp === undefined || done.has(req.timestamp)) return
    done.add(req.timestamp)
    cb({ source: req.inputText, text, providerId: String(key[1]), target: String(req.targetLanguage) })
  })
}
