import type { Doc } from './doc.ts'
import { parseMd } from './md.ts'
import { parseSrt } from './srt.ts'
import { parseTxt } from './txt.ts'

export type FileFormat = 'txt' | 'md' | 'srt'

/** 按扩展名（大小写不敏感）判断格式；不支持返回 null。 */
export function formatOf(fileName: string): FileFormat | null {
  const m = /\.(txt|md|srt)$/i.exec(fileName)
  return m ? (m[1].toLowerCase() as FileFormat) : null
}

export function parseByFormat(format: FileFormat, text: string): Doc {
  return format === 'md' ? parseMd(text) : format === 'srt' ? parseSrt(text) : parseTxt(text)
}

/** 另存为的默认文件名：`<原名>.译.<扩展名>`（扩展名保持原样的大小写）。 */
export function translatedFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? `${fileName.slice(0, dot)}.译${fileName.slice(dot)}` : `${fileName}.译`
}

/** 默认路径：与源文件同目录。 */
export function translatedFilePath(sourcePath: string, fileName: string): string {
  const sep = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'))
  return sep >= 0 ? sourcePath.slice(0, sep + 1) + translatedFileName(fileName) : translatedFileName(fileName)
}
