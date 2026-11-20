// SRT 字幕：序号行、时间轴行、条目间空行原样保留，只把每条的字幕文本作为一个单元。
// 识别不出条目结构（没有时间轴）的块整块原样保留，不翻译，保证条目数与时间轴不变。
import { type Doc, emptyDoc, keep, normalizeEol, pushLiteral, pushText } from './doc.ts'

const TIMING = /^\s*\d{1,3}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,3}:\d{2}:\d{2}[,.]\d{1,3}/
const INDEX = /^\s*\d+\s*$/
// 字幕里的样式标签：<i>、<font color="…">、ASS 风格的 {\an8}。
const TAG = /<\/?[A-Za-z][^<>]*>|\{\\[^{}]*\}/g

export function parseSrt(source: string): Doc {
  const { text, eol } = normalizeEol(source)
  const doc: Doc = { ...emptyDoc(eol), noBlankLines: true }
  const pieces = text.split(/(\n[ \t]*(?:\n[ \t]*)+)/)
  pieces.forEach((block, i) => {
    if (i % 2 === 1) return pushLiteral(doc, block)
    const lines = block.split('\n')
    // 时间轴在第 1 行（无序号）或第 2 行（有序号）。
    const t = TIMING.test(lines[0] ?? '') ? 0 : INDEX.test(lines[0] ?? '') && TIMING.test(lines[1] ?? '') ? 1 : -1
    if (t < 0 || lines.length === t + 1) return pushLiteral(doc, block)
    pushLiteral(doc, `${lines.slice(0, t + 1).join('\n')}\n`)
    pushText(doc, lines.slice(t + 1).join('\n').replace(TAG, (tag) => keep(doc, tag)))
  })
  return doc
}

/** 条目的序号与时间轴（用于校验译文结构不变）。 */
export function srtSkeleton(text: string): string[] {
  return normalizeEol(text)
    .text.split('\n')
    .filter((line) => TIMING.test(line) || INDEX.test(line))
    .map((line) => line.trim())
}
