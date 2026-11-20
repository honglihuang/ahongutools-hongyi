// 文件翻译的统一文档模型：原文拆成「原样保留的片段」和「待翻译单元」，译完按原顺序拼回。
// 各格式（txt / md / srt）只负责拆分；保留什么、翻译什么由各自的 parse 决定。
// 受保护的内容（代码、链接地址、标签）在单元里换成占位符 ⟪i⟫，i 在整篇文档内唯一，原文在 doc.protect[i]。

export interface Unit {
  /** 已去掉首尾空白、受保护内容换成占位符的待译文本；不含空行（多个单元用空行拼成一批）。 */
  text: string
}

export interface Doc {
  /** 字符串原样输出，数字是 units 的下标。 */
  parts: Array<string | number>
  units: Unit[]
  protect: string[]
  /** 原文的换行符，拼回时还原。 */
  eol: '\n' | '\r\n'
  /** 译文里不允许出现空行（srt：空行是条目分隔符，多一个空行就多一个条目）。 */
  noBlankLines?: boolean
}

/** 整个文件的字符上限（按 Unicode 码点计）。 */
export const MAX_TOTAL_CHARS = 100_000
/** 单个单元的字符上限：超过就按行、再按句子切开。 */
export const MAX_UNIT_CHARS = 3000

export class TooLargeError extends Error {
  constructor(chars: number, limit: number) {
    super(`文件共 ${chars} 个字符，超过 ${limit} 字符的上限，请拆分后再翻译`)
    this.name = 'TooLargeError'
  }
}

export const charCount = (text: string) => [...text].length

/** 总字符数超限时抛 TooLargeError。 */
export function assertWithinLimit(text: string, limit = MAX_TOTAL_CHARS): void {
  const chars = charCount(text)
  if (chars > limit) throw new TooLargeError(chars, limit)
}

/** 统一成 \n 并记下原来的换行符（出现过 \r\n 就按 \r\n 还原）。 */
export function normalizeEol(text: string): { text: string; eol: '\n' | '\r\n' } {
  return { text: text.replace(/\r\n?/g, '\n'), eol: text.includes('\r\n') ? '\r\n' : '\n' }
}

export function emptyDoc(eol: Doc['eol']): Doc {
  return { parts: [], units: [], protect: [], eol }
}

const PLACEHOLDER = /⟪(\d+)⟫/g
const placeholderKeys = (text: string) => [...text.matchAll(PLACEHOLDER)].map((m) => Number(m[1]))
// 模型可能在占位符里加空格（⟪ 3 ⟫），还原时容忍。
const LOOSE_PLACEHOLDER = /⟪\s*(\d+)\s*⟫/g

/** 把 raw 登记为受保护内容，返回占位符。 */
export function keep(doc: Doc, raw: string): string {
  return `⟪${doc.protect.push(raw) - 1}⟫`
}

/** 占位符换回原文（用于不翻译的片段）。 */
export function unprotect(doc: Doc, text: string): string {
  return text.replace(PLACEHOLDER, (_m, n: string) => doc.protect[Number(n)] ?? _m)
}

export function pushLiteral(doc: Doc, text: string): void {
  if (text !== '') doc.parts.push(text)
}

/**
 * 追加一段可能需要翻译的文本（可含占位符，不含空行）：首尾空白原样保留；
 * 没有可翻译的字（只有空白、占位符、数字和符号）就整段原样输出；过长时按行、再按句子切成多个单元。
 */
export function pushText(doc: Doc, text: string): void {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!
  const [, lead, core, trail] = m
  pushLiteral(doc, lead)
  if (!/\p{L}/u.test(core.replace(PLACEHOLDER, ''))) {
    pushLiteral(doc, unprotect(doc, core))
  } else {
    const pieces = splitLong(core, MAX_UNIT_CHARS)
    pieces.forEach((piece, i) => {
      if (i > 0) pushLiteral(doc, piece.sep)
      doc.parts.push(doc.units.push({ text: piece.text }) - 1)
    })
  }
  pushLiteral(doc, trail)
}

/** 超过 limit 的文本先按换行切，单行仍超长再按句末标点切；sep 是与前一块之间的原分隔符。 */
function splitLong(text: string, limit: number): Array<{ text: string; sep: string }> {
  if (charCount(text) <= limit) return [{ text, sep: '' }]
  const out: Array<{ text: string; sep: string }> = []
  let cur = ''
  let curSep = ''
  const flush = () => {
    if (cur !== '') out.push({ text: cur, sep: curSep })
    cur = ''
  }
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    const sentences = charCount(line) <= limit ? [line] : (line.match(/[^.!?。！？]+[.!?。！？]*\s*/gu) ?? [line])
    sentences.forEach((s, si) => {
      const sep = si === 0 && li > 0 ? '\n' : ''
      if (cur !== '' && charCount(cur) + charCount(s) + sep.length > limit) {
        flush()
        curSep = sep
        cur = s
      } else {
        if (cur === '') curSep = sep
        else cur += sep
        cur += s
      }
    })
  })
  flush()
  return out
}

/** 每批的字符上限：一批是若干单元用空行拼成的一次 translateOnce 调用（单次输入上限待实测 T-17）。 */
export const BATCH_CHARS = 4000

/** 按顺序把单元装进批次（下标数组），每批不超过 maxChars；单个超长单元单独一批。 */
export function makeBatches(doc: Doc, maxChars = BATCH_CHARS): number[][] {
  const batches: number[][] = []
  let cur: number[] = []
  let size = 0
  doc.units.forEach((u, i) => {
    const n = charCount(u.text)
    if (cur.length > 0 && size + 2 + n > maxChars) {
      batches.push(cur)
      cur = []
      size = 0
    }
    size += (cur.length > 0 ? 2 : 0) + n
    cur.push(i)
  })
  if (cur.length > 0) batches.push(cur)
  return batches
}

export const BATCH_SEPARATOR = '\n\n'

/** 一批的请求文本：单元之间空一行。 */
export function batchText(doc: Doc, batch: number[]): string {
  return batch.map((i) => doc.units[i].text).join(BATCH_SEPARATOR)
}

/** 按空行把整批译文拆回各单元；段数对不上返回 null（调用方改为逐个单元翻译）。 */
export function splitBatchResult(translated: string, count: number): string[] | null {
  const pieces = translated
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n[ \t]*\n\s*/)
  if (count === 1) return [pieces.join('\n')]
  return pieces.length === count ? pieces : null
}

/**
 * 单元译文里的占位符换回原文。该单元的每个占位符必须恰好出现一次、且没有多出别的占位符，否则返回 null
 * （调用方重试或用原文，保证代码、链接不被改坏）。
 */
export function restoreUnit(doc: Doc, unit: number, translated: string): string | null {
  const expected = placeholderKeys(doc.units[unit].text).sort((a, b) => a - b)
  const got: number[] = []
  const out = translated.trim().replace(LOOSE_PLACEHOLDER, (_m, n: string) => {
    got.push(Number(n))
    return doc.protect[Number(n)] ?? ''
  })
  got.sort((a, b) => a - b)
  if (got.length !== expected.length || got.some((k, i) => k !== expected[i])) return null
  return out
}

/** 按 parts 拼回全文。translations[i] 是第 i 个单元已还原的译文；undefined 表示保留原文。 */
export function render(doc: Doc, translations: ReadonlyArray<string | undefined>): string {
  const body = doc.parts
    .map((p) => {
      if (typeof p === 'string') return p
      const t = translations[p] ?? unprotect(doc, doc.units[p].text)
      return doc.noBlankLines ? t.replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n') : t
    })
    .join('')
  return doc.eol === '\n' ? body : body.replace(/\n/g, doc.eol)
}
