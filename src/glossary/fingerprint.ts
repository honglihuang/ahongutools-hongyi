// 翻译上下文指纹：搜索框直出缓存（public/preload/main-push.js 的 setContext）按它整体失效。
// 只看会改变译文的内容：术语表开关、能生效的术语（启用的、网址范围为空的术语表里启用的术语）、当前提示词。
// 不用 rf:glossaryRevision 计数：它在 utools.dbStorage 里随账号同步，而术语只存在本机 localStore。
// 纯函数，不依赖上游运行时代码（node --test 直接跑）。

export interface FingerprintGlossary {
  id: string
  enabled: boolean
  matchPatterns: readonly string[]
}

export interface FingerprintTerm {
  glossaryId: string
  source: string
  target: string
  targetLang: string
  caseSensitive: boolean
  enabled: boolean
}

export interface FingerprintInput {
  /** config.glossary.enabled */
  enabled: boolean
  /** 列表顺序（createdAt 升序）：同一术语在两个术语表里时后者优先，顺序会影响译文。 */
  glossaries: readonly FingerprintGlossary[]
  terms: readonly FingerprintTerm[]
  /** 读术语表失败（库打不开等）：翻译时不带术语，指纹与正常读到时不同。 */
  termsUnavailable?: boolean
  prompt: { id: string; systemPrompt: string; prompt: string }
}

/** cyrb53：53 位非加密散列，够区分上下文；输出 14 位十六进制。 */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

function applicableTerms(input: FingerprintInput): unknown {
  if (!input.enabled) return null
  if (input.termsUnavailable) return 'unavailable'
  const byGlossary = new Map<string, string[]>()
  for (const t of input.terms) {
    if (!t.enabled) continue
    const list = byGlossary.get(t.glossaryId) ?? []
    list.push(JSON.stringify([t.source, t.target, t.targetLang, t.caseSensitive]))
    byGlossary.set(t.glossaryId, list)
  }
  // 术语表之间保持列表顺序；表内排序，使存储顺序不影响指纹。
  return input.glossaries
    .filter((g) => g.enabled && g.matchPatterns.length === 0)
    .map((g) => (byGlossary.get(g.id) ?? []).sort())
    .filter((list) => list.length > 0)
}

export function contextFingerprint(input: FingerprintInput): string {
  const { id, systemPrompt, prompt } = input.prompt
  return cyrb53(JSON.stringify({ g: input.enabled, t: applicableTerms(input), p: [id, systemPrompt, prompt] }))
}
