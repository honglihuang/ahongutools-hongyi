// 纯文本：按段落（空行分隔）切成单元，段落之间的空行原样保留。
import { type Doc, emptyDoc, normalizeEol, pushLiteral, pushText } from './doc.ts'

export function parseTxt(source: string): Doc {
  const { text, eol } = normalizeEol(source)
  const doc = emptyDoc(eol)
  // 切分符：一个换行 + 至少一个只含空白的行。split 的捕获组让分隔符留在结果里。
  const pieces = text.split(/(\n[ \t]*(?:\n[ \t]*)+)/)
  pieces.forEach((piece, i) => (i % 2 === 1 ? pushLiteral(doc, piece) : pushText(doc, piece)))
  return doc
}
