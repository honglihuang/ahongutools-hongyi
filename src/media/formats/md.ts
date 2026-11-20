// Markdown：逐行扫描块结构，只把文字交给翻译。
// 原样保留（不翻译）：front matter、``` / ~~~ 围栏代码、缩进代码、<pre>/<script>/<style>/<textarea> 块、分隔线、
// 链接引用定义、表格分隔行、各行的标记前缀（#、列表符号、> 引用）。
// 文字里换成占位符的：行内代码、HTML 标签与注释、<自动链接>、链接与图片的 [ 和 ](地址 "标题")、脚注引用、裸 URL。
// 简化处：引用块里每行单独成一个单元（不跨行合并）；列表里缩进 4 格的内容按列表段落处理，不当缩进代码。
import { type Doc, emptyDoc, keep, normalizeEol, pushLiteral, pushText } from './doc.ts'

const FENCE = /^[ \t]*(`{3,}|~{3,})/
const RAW_HTML_OPEN = /^ {0,3}<(pre|script|style|textarea)(?=[\s>]|$)/i
const INDENTED = /^(?: {4}|\t)/
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const TABLE_SEP = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const ATX = /^( {0,3}#{1,6})([ \t]+|$)/
const ATX_CLOSE = /([ \t]+#+[ \t]*|[ \t]+)$/
const REFDEF = /^ {0,3}\[(?!\^)[^\]]+\]:[ \t]*\S/
const FOOTDEF = /^ {0,3}\[\^[^\]]+\]:[ \t]*/
const QUOTE = /^(?:[ \t]{0,3}>[ \t]?)+/
const LIST = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?(?:[ \t]+|$)/
const BLANK = /^[ \t]*$/

const INLINE_CODE = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g
const HTML_INLINE =
  /<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>|<(?:[A-Za-z][\w+.-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>]+)>/g
// [文字](地址 "标题")、![替代文字](地址)、[文字][引用]；文字里允许一层方括号（用于图片套链接）。
const LINK =
  /(!?\[)((?:\\.|[^\\[\]]|\[(?:\\.|[^\\[\]])*\])*)(\]\([^()\s]*(?:\([^()\s]*\)[^()\s]*)*(?:\s+(?:"[^"]*"|'[^']*'))?[ \t]*\)|\]\[[^\]]*\])/g
const FOOTNOTE_REF = /\[\^[^\]\s]+\]/g
const BARE_URL = /\b(?:https?|ftp):\/\/[^\s<>⟪⟫]*[^\s<>⟪⟫.,;:!?'")\]]/g

function protectLinks(doc: Doc, text: string): string {
  return text.replace(LINK, (_m, open: string, label: string, close: string) =>
    keep(doc, open) + protectLinks(doc, label) + keep(doc, close),
  )
}

/** 行内不翻译的内容换成占位符。顺序：代码优先（代码里的 <、[ 不再当标签、链接处理）。 */
export function protectInline(doc: Doc, text: string): string {
  const k = (raw: string) => keep(doc, raw)
  let out = text.replace(INLINE_CODE, k).replace(HTML_INLINE, k)
  out = protectLinks(doc, out)
  return out.replace(FOOTNOTE_REF, k).replace(BARE_URL, k)
}

const pushInline = (doc: Doc, text: string) => pushText(doc, protectInline(doc, text))

/** 表格行：| 原样保留，每个单元格单独翻译。 */
function pushTableRow(doc: Doc, row: string): void {
  const cells = protectInline(doc, row).split(/((?<!\\)\|)/)
  cells.forEach((cell, i) => (i % 2 === 1 ? pushLiteral(doc, cell) : pushText(doc, cell)))
}

/** 从 start 往后找第一行满足 test 的下标；找不到返回 -1。 */
function findLine(lines: string[], start: number, test: (line: string) => boolean): number {
  for (let j = start; j < lines.length; j++) if (test(lines[j])) return j
  return -1
}

export function parseMd(source: string): Doc {
  const { text, eol } = normalizeEol(source)
  const doc = emptyDoc(eol)
  const lines = text.split('\n')
  const last = lines.length - 1
  let para: string[] = []
  let inList = false
  let inTable = false
  let prevBlank = true

  const flushPara = () => {
    if (para.length === 0) return
    pushInline(doc, para.join('\n'))
    pushLiteral(doc, '\n')
    para = []
  }
  /** 第 from..to 行整段原样输出（含行尾换行）。 */
  const literalLines = (from: number, to: number) => {
    flushPara()
    pushLiteral(doc, lines.slice(from, to + 1).join('\n') + (to < last ? '\n' : ''))
  }
  const endLine = (i: number) => pushLiteral(doc, i < last ? '\n' : '')

  let i = 0
  if (lines[0] === '---') {
    const end = findLine(lines, 1, (l) => l === '---' || l === '...')
    if (end > 0) {
      literalLines(0, end)
      i = end + 1
    }
  }
  for (; i <= last; i++) {
    const line = lines[i]
    const blank = BLANK.test(line)
    if (blank) {
      flushPara()
      inTable = false
      pushLiteral(doc, line)
      endLine(i)
      prevBlank = true
      continue
    }
    const wasBlank = prevBlank
    prevBlank = false

    const fence = FENCE.exec(line)
    if (fence) {
      const ch = fence[1][0]
      const len = fence[1].length
      const closeFence = new RegExp(`^[ \\t]*${ch === '`' ? '`' : '~'}{${len},}[ \\t]*$`)
      const close = findLine(lines, i + 1, (l) => closeFence.test(l))
      const end = close < 0 ? last : close
      literalLines(i, end)
      i = end
      continue
    }
    const html = RAW_HTML_OPEN.exec(line)
    if (html || /^ {0,3}<!--/.test(line)) {
      const closeTag = html ? new RegExp(`</${html[1]}>`, 'i') : /-->/
      const end = closeTag.test(line) ? i : findLine(lines, i + 1, (l) => closeTag.test(l))
      literalLines(i, end < 0 ? last : end)
      i = end < 0 ? last : end
      continue
    }
    if (INDENTED.test(line) && !inList && para.length === 0 && wasBlank) {
      // 缩进代码：一直到下一个既不缩进也不是空行的行。
      let end = i
      while (end + 1 <= last && (INDENTED.test(lines[end + 1]) || BLANK.test(lines[end + 1]))) end++
      // 末尾的空行不算代码，留给下一轮按空行处理。
      while (end > i && BLANK.test(lines[end])) end--
      literalLines(i, end)
      i = end
      continue
    }
    if (para.length > 0 && SETEXT.test(line)) {
      flushPara()
      pushLiteral(doc, line)
      endLine(i)
      continue
    }
    if (HR.test(line) || REFDEF.test(line)) {
      literalLines(i, i)
      continue
    }
    if (inTable || (line.includes('|') && i < last && lines[i + 1].includes('|') && TABLE_SEP.test(lines[i + 1]))) {
      flushPara()
      if (!inTable) {
        // 表头行在这里处理，分隔行在下一轮原样输出。
        inTable = true
        pushTableRow(doc, line)
        endLine(i)
        pushLiteral(doc, lines[i + 1])
        endLine(i + 1)
        i++
        continue
      }
      if (!line.includes('|')) {
        inTable = false
      } else {
        pushTableRow(doc, line)
        endLine(i)
        continue
      }
    }
    const atx = ATX.exec(line)
    if (atx) {
      flushPara()
      inList = false
      pushLiteral(doc, atx[0])
      const rest = line.slice(atx[0].length)
      const close = ATX_CLOSE.exec(rest)
      const content = close ? rest.slice(0, close.index) : rest
      pushInline(doc, content)
      pushLiteral(doc, close ? close[0] : '')
      endLine(i)
      continue
    }
    let prefix = ''
    let rest = line
    const quote = QUOTE.exec(rest)
    if (quote) {
      prefix += quote[0]
      rest = rest.slice(quote[0].length)
    }
    const list = LIST.exec(rest) ?? FOOTDEF.exec(rest)
    if (list) {
      prefix += list[0]
      rest = rest.slice(list[0].length)
      inList = true
    } else if (!quote && !INDENTED.test(line)) {
      inList = false
    }
    if (prefix !== '') {
      flushPara()
      pushLiteral(doc, prefix)
      if (quote && !list) {
        // 引用行单独成一个单元，不和后面的行合并。
        pushInline(doc, rest)
        endLine(i)
        continue
      }
    }
    if (INDENTED.test(line) && wasBlank) flushPara()
    para.push(rest)
    if (i === last) {
      pushInline(doc, para.join('\n'))
      para = []
    }
  }
  return doc
}
