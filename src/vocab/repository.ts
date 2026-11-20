// 生词本仓库：window.services.localStore 键 'vocab'（本机，不同步），存 { version: 1, entries: VocabEntry[] }。
// 写法同 src/glossary/repository.ts：写入经一条内存队列串行，每次读出整份、改完整份写回；认不出的存储内容报错，不覆盖。
import type { VocabDraft, VocabEntry } from './contract.ts'
import { canAddToVocab, dedupeKey, newestFirst } from './logic.ts'

export const VOCAB_STORE_KEY = 'vocab'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readEntries(): Promise<VocabEntry[]> {
  const value = await window.services.localStore.get<unknown>(VOCAB_STORE_KEY)
  if (value === undefined || value === null) return []
  // 认不出的内容不当成空表：否则下一次写入会把它整份覆盖掉。
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) {
    throw new Error('本机生词本数据格式不对（不是 version 1），未读取，也不会覆盖')
  }
  return value.entries as VocabEntry[]
}

let queue: Promise<unknown> = Promise.resolve()

/** 串行执行一次读改写；task 返回 save=false 时不写回。 */
function mutate<T>(task: (entries: VocabEntry[]) => { result: T; entries?: VocabEntry[] }): Promise<T> {
  const run = queue.then(async () => {
    const { result, entries } = task(await readEntries())
    if (entries) await window.services.localStore.set(VOCAB_STORE_KEY, { version: 1, entries })
    return result
  })
  queue = run.catch(() => undefined)
  return run
}

/** 全部生词，新加的在前。 */
export async function listVocab(): Promise<VocabEntry[]> {
  return newestFirst(await readEntries())
}

/** 与 draft 同一原文（规范化后）、同一释义语言的已有生词；exceptId 是正在编辑的那条。 */
export async function findDuplicate(
  draft: Pick<VocabDraft, 'term' | 'targetLang'>,
  exceptId?: string,
): Promise<VocabEntry | undefined> {
  const key = dedupeKey(draft.term, draft.targetLang)
  return (await readEntries()).find((e) => e.id !== exceptId && dedupeKey(e.term, e.targetLang) === key)
}

export type SaveVocabResult =
  | { ok: true; id: string; updated: boolean }
  | { ok: false; reason: 'empty' | 'tooLong' | 'duplicate' | 'notFound' }

export type VocabFields = Pick<VocabEntry, 'term' | 'meaning' | 'sourceLang' | 'targetLang'>

function invalid(fields: VocabFields): 'empty' | 'tooLong' | null {
  if (fields.term.trim() === '') return 'empty'
  return canAddToVocab(fields.term) ? null : 'tooLong'
}

const clean = (fields: VocabFields): VocabFields => ({
  term: fields.term.trim(),
  meaning: fields.meaning.trim(),
  sourceLang: fields.sourceLang,
  targetLang: fields.targetLang,
})

/**
 * 加入生词本。已有同一原文（规范化后）、同一释义语言的生词时不新建，只把它的释义改成这次的（updated: true）。
 */
export function addVocab(draft: VocabDraft): Promise<SaveVocabResult> {
  const bad = invalid(draft)
  if (bad) return Promise.resolve({ ok: false, reason: bad })
  const fields = clean(draft)
  return mutate<SaveVocabResult>((entries) => {
    const now = Date.now()
    const key = dedupeKey(fields.term, fields.targetLang)
    const existing = entries.find((e) => dedupeKey(e.term, e.targetLang) === key)
    if (existing) {
      const next = entries.map((e) => (e === existing ? { ...e, meaning: fields.meaning, updatedAt: now } : e))
      return { result: { ok: true, id: existing.id, updated: true }, entries: next }
    }
    const entry: VocabEntry = { id: crypto.randomUUID(), ...fields, from: draft.from, createdAt: now, updatedAt: now }
    return { result: { ok: true, id: entry.id, updated: false }, entries: [...entries, entry] }
  })
}

/** 编辑一条生词。改后的原文 + 释义语言不能与另一条重复；这条已被删掉时不写入（ok: false, reason: 'notFound'）。 */
export function updateVocab(id: string, input: VocabFields): Promise<SaveVocabResult> {
  const bad = invalid(input)
  if (bad) return Promise.resolve({ ok: false, reason: bad })
  const fields = clean(input)
  return mutate<SaveVocabResult>((entries) => {
    if (!entries.some((e) => e.id === id)) return { result: { ok: false, reason: 'notFound' } }
    const key = dedupeKey(fields.term, fields.targetLang)
    if (entries.some((e) => e.id !== id && dedupeKey(e.term, e.targetLang) === key)) {
      return { result: { ok: false, reason: 'duplicate' } }
    }
    const now = Date.now()
    const next = entries.map((e) => (e.id === id ? { ...e, ...fields, updatedAt: now } : e))
    return { result: { ok: true, id, updated: true }, entries: next }
  })
}

export function deleteVocab(id: string): Promise<void> {
  return mutate((entries) => ({ result: undefined, entries: entries.filter((e) => e.id !== id) }))
}
