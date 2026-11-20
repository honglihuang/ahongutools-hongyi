// 按批次翻译一篇文档：整批译文段数对不上或占位符被改坏时，改为逐个单元重译；
// 单个单元仍然改坏占位符就保留原文（代码、链接不能被改坏），计入 fallback。
import { type Doc, batchText, makeBatches, render, restoreUnit, splitBatchResult } from './doc.ts'

export type TranslateText = (text: string, signal: AbortSignal) => Promise<string>

export interface RunProgress {
  done: number
  total: number
}

export interface RunResult {
  text: string
  /** 因占位符校验失败而保留原文的单元数。 */
  fallback: number
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
}

export async function translateDoc(
  doc: Doc,
  translate: TranslateText,
  { signal, onProgress, batchChars }: { signal: AbortSignal; onProgress?: (p: RunProgress) => void; batchChars?: number },
): Promise<RunResult> {
  const batches = makeBatches(doc, batchChars)
  const out: Array<string | undefined> = new Array(doc.units.length)
  let fallback = 0
  let done = 0
  onProgress?.({ done, total: doc.units.length })
  for (const batch of batches) {
    throwIfAborted(signal)
    const result = await translate(batchText(doc, batch), signal)
    throwIfAborted(signal)
    const pieces = splitBatchResult(result, batch.length)
    const restored = pieces?.map((p, k) => restoreUnit(doc, batch[k], p))
    if (restored && restored.every((r) => r !== null)) {
      batch.forEach((u, k) => (out[u] = restored[k]!))
    } else if (batch.length === 1) {
      fallback++
    } else {
      for (const u of batch) {
        throwIfAborted(signal)
        const single = restoreUnit(doc, u, await translate(doc.units[u].text, signal))
        throwIfAborted(signal)
        if (single === null) fallback++
        else out[u] = single
      }
    }
    done += batch.length
    onProgress?.({ done, total: doc.units.length })
  }
  return { text: render(doc, out), fallback }
}
