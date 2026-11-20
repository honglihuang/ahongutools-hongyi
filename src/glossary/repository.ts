// 术语表仓库：改编自上游 upstream/read-frog/src/utils/glossary/repository.ts（Read Frog，GPL-3.0，本工程同一许可证）。
// uTools 插件页的 IndexedDB 不落盘（重启 uTools 后术语表消失），所以不用上游 Dexie 库，改存 window.services.localStore
// 键 'glossary'（preload 写在插件本机数据目录下的 JSON 文件，不同步）：{ version: 1, glossaries, terms }，行字段与上游
// Glossary / GlossaryTerm 表相同（日期存 ISO 字符串，读出时还原为 Date）。
// 函数签名、返回值、上限、重复规则、排序与 revision 递增时机都照上游；写入经一条内存队列串行，每次读出整份文档、改完整份写回。
import type { LangCodeISO6393 } from '@read-frog/definitions'
import type { ParsedGlossaryRow } from '@/utils/glossary/csv'
import type { GlossaryTargetLang } from '@/utils/glossary/target-language'
import type { GlossaryEntry } from '@/utils/glossary/types'
import { storage } from '#imports'
import {
  GLOSSARY_REVISION_KEY,
  MAX_GLOSSARIES,
  MAX_GLOSSARY_DESCRIPTION_LENGTH,
  MAX_GLOSSARY_NAME_LENGTH,
  MAX_GLOSSARY_SOURCE_LENGTH,
  MAX_GLOSSARY_TARGET_LENGTH,
  MAX_GLOSSARY_TERMS,
} from '@/utils/constants/glossary'
import { getRandomUUID } from '@/utils/crypto-polyfill'
import { formatGlossaryCsv } from '@/utils/glossary/csv'
import { buildMatchKey } from '@/utils/glossary/match-key'
import { isGlossaryActiveForUrl, mergeGlossaryTerms } from '@/utils/glossary/scope'
import { appliesToLanguage, targetLangPrecedence } from '@/utils/glossary/target-language'

export const GLOSSARY_STORE_KEY = 'glossary'

/** 与上游 utils/db/dexie/tables/glossary.ts 同字段。uTools 里没有网页，matchPatterns 恒为空。 */
export interface Glossary {
  id: string
  name: string
  description: string
  enabled: boolean
  matchPatterns: string[]
  createdAt: Date
  updatedAt: Date
}

/** 与上游 utils/db/dexie/tables/glossary-term.ts 同字段（上游术语没有 createdAt）。 */
export interface GlossaryTerm {
  id: string
  glossaryId: string
  matchKey: string
  targetLang: GlossaryTargetLang
  source: string
  target: string
  caseSensitive: boolean
  enabled: boolean
  updatedAt: Date
}

interface GlossaryDocument {
  glossaries: Glossary[]
  terms: GlossaryTerm[]
}

type Stored<T> = Omit<T, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function readDocument(): Promise<GlossaryDocument> {
  const value = await window.services.localStore.get<unknown>(GLOSSARY_STORE_KEY)
  if (value === undefined || value === null) return { glossaries: [], terms: [] }
  // 认不出的内容不当成空表：否则下一次写入会把它整份覆盖掉。
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.glossaries) || !Array.isArray(value.terms)) {
    throw new Error('本机术语表数据格式不对（不是 version 1），未读取，也不会覆盖')
  }
  return {
    glossaries: (value.glossaries as Stored<Glossary>[]).map((g) => ({
      ...g,
      createdAt: new Date(g.createdAt!),
      updatedAt: new Date(g.updatedAt),
    })),
    terms: (value.terms as Stored<GlossaryTerm>[]).map((t) => ({ ...t, updatedAt: new Date(t.updatedAt) })),
  }
}

async function writeDocument(doc: GlossaryDocument): Promise<void> {
  await window.services.localStore.set(GLOSSARY_STORE_KEY, {
    version: 1,
    glossaries: doc.glossaries.map((g) => ({ ...g, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString() })),
    terms: doc.terms.map((t) => ({ ...t, updatedAt: t.updatedAt.toISOString() })),
  })
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * 串行执行一次读改写。task 返回 save=false 时不写回（上游 update 命中 0 行的情形），bump 决定是否递增 revision。
 * revision 在文档写成功之后才递增，与上游「先写表、再 bump」同序。
 */
function mutate<T>(task: (doc: GlossaryDocument) => { result: T; save: boolean; bump: boolean }): Promise<T> {
  const run = queue.then(async () => {
    const doc = await readDocument()
    const { result, save, bump } = task(doc)
    if (save) await writeDocument(doc)
    if (bump) await bumpGlossaryRevision()
    return result
  })
  queue = run.catch(() => undefined)
  return run
}

// 上游 Dexie 的排序：按索引值，相同时按主键 id（IndexedDB 比较字符串按 UTF-16 码元，与 < 相同）。
const cmpId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const byCreatedAt = (a: Glossary, b: Glossary) => a.createdAt.getTime() - b.createdAt.getTime() || cmpId(a, b)
const byUpdatedAt = (a: GlossaryTerm, b: GlossaryTerm) => a.updatedAt.getTime() - b.updatedAt.getTime() || cmpId(a, b)
const byMatchKey = (a: GlossaryTerm, b: GlossaryTerm) =>
  (a.matchKey < b.matchKey ? -1 : a.matchKey > b.matchKey ? 1 : 0) || cmpId(a, b)

export async function getGlossaryRevision(): Promise<number> {
  return (await storage.getItem<number>(GLOSSARY_REVISION_KEY)) ?? 0
}

async function bumpGlossaryRevision(): Promise<number> {
  const next = (await getGlossaryRevision()) + 1
  await storage.setItem<number>(GLOSSARY_REVISION_KEY, next)
  return next
}

// ---------------------------------------------------------------------------
// Glossaries
// ---------------------------------------------------------------------------

/** 创建时间升序：列表显示顺序，也是同一术语在两个术语表里时的优先顺序（后者优先）。 */
export async function listGlossaries(): Promise<Glossary[]> {
  return (await readDocument()).glossaries.sort(byCreatedAt)
}

export type CreateGlossaryResult = { ok: true; id: string } | { ok: false; reason: 'capReached' }

/** name 由调用方给（默认名要本地化）。与上游相同：空术语表不影响匹配，不递增 revision。 */
export function createGlossary(name: string): Promise<CreateGlossaryResult> {
  return mutate<CreateGlossaryResult>((doc) => {
    if (doc.glossaries.length >= MAX_GLOSSARIES) {
      return { result: { ok: false, reason: 'capReached' } as const, save: false, bump: false }
    }
    const now = new Date()
    const id = getRandomUUID()
    doc.glossaries.push({
      id,
      name: name.trim().slice(0, MAX_GLOSSARY_NAME_LENGTH),
      description: '',
      enabled: true,
      matchPatterns: [],
      createdAt: now,
      updatedAt: now,
    })
    return { result: { ok: true, id } as const, save: true, bump: false }
  })
}

/** 改名或改说明。空名称忽略不存；两项都不参与匹配，不递增 revision（同上游）。 */
export function updateGlossaryMeta(id: string, meta: { name?: string; description?: string }): Promise<void> {
  return mutate((doc) => {
    const glossary = doc.glossaries.find((g) => g.id === id)
    if (!glossary) return { result: undefined, save: false, bump: false }
    glossary.updatedAt = new Date()
    const name = meta.name?.trim()
    if (name) glossary.name = name.slice(0, MAX_GLOSSARY_NAME_LENGTH)
    if (meta.description !== undefined) glossary.description = meta.description.slice(0, MAX_GLOSSARY_DESCRIPTION_LENGTH)
    return { result: undefined, save: true, bump: false }
  })
}

export function setGlossaryEnabled(id: string, enabled: boolean): Promise<void> {
  return mutate((doc) => {
    const glossary = doc.glossaries.find((g) => g.id === id)
    if (!glossary) return { result: undefined, save: false, bump: false }
    glossary.enabled = enabled
    glossary.updatedAt = new Date()
    return { result: undefined, save: true, bump: true }
  })
}

/** 删除术语表和其中全部术语（同一次写入）。 */
export function deleteGlossary(id: string): Promise<void> {
  return mutate((doc) => {
    doc.terms = doc.terms.filter((t) => t.glossaryId !== id)
    doc.glossaries = doc.glossaries.filter((g) => g.id !== id)
    return { result: undefined, save: true, bump: true }
  })
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export interface GlossaryTermInput {
  source: string
  target: string
  caseSensitive: boolean
  /** 这条译法用于哪个目标语言，或所有语言。 */
  targetLang: GlossaryTargetLang
  enabled?: boolean
}

export type SaveGlossaryTermResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'emptySource' | 'tooLong' | 'capReached' | 'duplicate' }

function validate(input: GlossaryTermInput): 'emptySource' | 'tooLong' | null {
  if (input.source.trim() === '') return 'emptySource'
  if (input.source.length > MAX_GLOSSARY_SOURCE_LENGTH || input.target.length > MAX_GLOSSARY_TARGET_LENGTH) {
    return 'tooLong'
  }
  return null
}

/** 一个术语表的术语，updatedAt 升序（与上游查询结果同序）。 */
export async function listGlossaryTerms(glossaryId: string): Promise<GlossaryTerm[]> {
  return (await readDocument()).terms.filter((t) => t.glossaryId === glossaryId).sort(byUpdatedAt)
}

export async function countGlossaryTermsByGlossary(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const term of (await readDocument()).terms) {
    counts.set(term.glossaryId, (counts.get(term.glossaryId) ?? 0) + 1)
  }
  return counts
}

/** 全部术语（所有术语表、含停用的），给翻译上下文指纹用。 */
export async function listAllGlossaryTerms(): Promise<GlossaryTerm[]> {
  return (await readDocument()).terms
}

/**
 * 匹配器要编译的术语：生效的术语表（按 url）里启用的、适用于 targetLang 的术语。
 * 同一术语表内「所有语言」的行排在前面，合并时后者优先，所以写给当前语言的译法覆盖「所有语言」的；
 * 跨术语表仍是后创建的优先（同上游）。
 */
export async function loadGlossaryEntries(targetLang: LangCodeISO6393, url?: string): Promise<GlossaryEntry[]> {
  const doc = await readDocument()
  const active = doc.glossaries.sort(byCreatedAt).filter((glossary) => isGlossaryActiveForUrl(glossary, url))
  if (active.length === 0) return []
  const groups = active.map((glossary) =>
    doc.terms
      .filter((term) => term.glossaryId === glossary.id)
      .sort(cmpId)
      .filter((term) => term.enabled && appliesToLanguage(term.targetLang, targetLang))
      .sort((a, b) => targetLangPrecedence(a.targetLang) - targetLangPrecedence(b.targetLang))
      .map(
        (term): GlossaryEntry => ({
          matchKey: term.matchKey,
          source: term.source,
          target: term.target,
          caseSensitive: term.caseSensitive,
        }),
      ),
  )
  return mergeGlossaryTerms(groups)
}

/**
 * 新增或修改一条术语。existingId 区分修改与新增：改原文会改 matchKey，不能与同一术语表、同一目标语言里的
 * 另一条术语重复，但可以留在正在改的这条上。
 */
export function saveGlossaryTerm(
  glossaryId: string,
  input: GlossaryTermInput,
  existingId?: string,
): Promise<SaveGlossaryTermResult> {
  const invalid = validate(input)
  if (invalid) return Promise.resolve({ ok: false, reason: invalid })
  const source = input.source.trim()
  const matchKey = buildMatchKey(source, input.caseSensitive)
  return mutate<SaveGlossaryTermResult>((doc) => {
    const clash = doc.terms.find(
      (t) => t.glossaryId === glossaryId && t.targetLang === input.targetLang && t.matchKey === matchKey,
    )
    if (clash && clash.id !== existingId) {
      return { result: { ok: false, reason: 'duplicate' } as const, save: false, bump: false }
    }
    if (!existingId && doc.terms.length >= MAX_GLOSSARY_TERMS) {
      return { result: { ok: false, reason: 'capReached' } as const, save: false, bump: false }
    }
    const id = existingId ?? getRandomUUID()
    const row: GlossaryTerm = {
      id,
      glossaryId,
      matchKey,
      targetLang: input.targetLang,
      source,
      target: input.target.trim(),
      caseSensitive: input.caseSensitive,
      enabled: input.enabled ?? true,
      updatedAt: new Date(),
    }
    // 与 Dexie put 相同：id 已有就整行替换，没有就新增。
    const index = doc.terms.findIndex((t) => t.id === id)
    if (index === -1) doc.terms.push(row)
    else doc.terms[index] = row
    return { result: { ok: true, id } as const, save: true, bump: true }
  })
}

/** 切换一条术语的启用状态。不改 updatedAt：列表按它排序，改了会让刚点的这行跳走（同上游）。 */
export function setGlossaryTermEnabled(id: string, enabled: boolean): Promise<void> {
  return mutate((doc) => {
    const term = doc.terms.find((t) => t.id === id)
    if (!term) return { result: undefined, save: false, bump: false }
    term.enabled = enabled
    return { result: undefined, save: true, bump: true }
  })
}

export function deleteGlossaryTerm(id: string): Promise<void> {
  return mutate((doc) => {
    doc.terms = doc.terms.filter((t) => t.id !== id)
    return { result: undefined, save: true, bump: true }
  })
}

export type ImportMode = 'merge' | 'replace'

export interface ImportGlossaryResult {
  ok: boolean
  added: number
  updated: number
  /** 同一文件里后面的行认领了同一术语，前面的被丢弃的行数。 */
  duplicatesInFile: number
  /** 拒绝导入的原因；ok 时没有，拒绝时列表不变。 */
  reason?: 'overflow' | 'no-valid-rows'
  /** reason 为 overflow 时超出的条数。 */
  overflowBy?: number
}

/**
 * 把解析好的行导入一个术语表。先按「目标语言 + matchKey」去重（同一文件里后面的行优先），再判断上限：
 * 超过 MAX_GLOSSARY_TERMS（全部术语表合计）就整次拒绝并给出超出条数，不截断；没有可写入的行也整次拒绝，
 * 保证 replace 不会只删不写。合并时已有术语保留 id 和停用状态。
 */
export function importGlossaryRows(
  glossaryId: string,
  rows: readonly ParsedGlossaryRow[],
  mode: ImportMode,
): Promise<ImportGlossaryResult> {
  return mutate((doc) => {
    const byKey = new Map<string, ParsedGlossaryRow>()
    let duplicatesInFile = 0
    for (const row of rows) {
      const source = row.source.trim()
      if (source === '') continue
      const key = `${row.targetLanguage}\u0000${buildMatchKey(source, row.caseSensitive)}`
      if (byKey.has(key)) duplicatesInFile++
      byKey.set(key, { ...row, source })
    }

    const inThisGlossary = doc.terms.filter((t) => t.glossaryId === glossaryId)
    const existing = mode === 'replace' ? [] : inThisGlossary
    const existingByKey = new Map(existing.map((term) => [`${term.targetLang}\u0000${term.matchKey}`, term]))

    let added = 0
    let updated = 0
    for (const key of byKey.keys()) {
      if (existingByKey.has(key)) updated++
      else added++
    }

    const totalTerms = doc.terms.length
    const finalCount = mode === 'replace' ? totalTerms - inThisGlossary.length + byKey.size : totalTerms + added
    if (finalCount > MAX_GLOSSARY_TERMS) {
      const result: ImportGlossaryResult = {
        ok: false,
        added: 0,
        updated: 0,
        duplicatesInFile,
        reason: 'overflow',
        overflowBy: finalCount - MAX_GLOSSARY_TERMS,
      }
      return { result, save: false, bump: false }
    }

    const now = new Date()
    const records: GlossaryTerm[] = [...byKey.entries()].map(([key, row]) => ({
      id: existingByKey.get(key)?.id ?? getRandomUUID(),
      glossaryId,
      matchKey: buildMatchKey(row.source, row.caseSensitive),
      targetLang: row.targetLanguage,
      source: row.source,
      target: row.target.trim(),
      caseSensitive: row.caseSensitive,
      enabled: existingByKey.get(key)?.enabled ?? true,
      updatedAt: now,
    }))
    if (records.length === 0) {
      const result: ImportGlossaryResult = { ok: false, added: 0, updated: 0, duplicatesInFile, reason: 'no-valid-rows' }
      return { result, save: false, bump: false }
    }

    const kept = mode === 'replace' ? doc.terms.filter((t) => t.glossaryId !== glossaryId) : doc.terms
    const replacedIds = new Set(records.map((r) => r.id))
    doc.terms = [...kept.filter((t) => !replacedIds.has(t.id)), ...records]
    const result: ImportGlossaryResult = { ok: true, added, updated, duplicatesInFile }
    return { result, save: true, bump: true }
  })
}

/** 术语表里全部术语（所有语言）导出为四列 CSV，按 matchKey 排序；区分大小写一栏也导出，才能导回原来的行。 */
export async function exportGlossaryCsv(glossaryId: string): Promise<string> {
  const terms = (await readDocument()).terms.filter((t) => t.glossaryId === glossaryId).sort(byMatchKey)
  return formatGlossaryCsv(
    terms.map((term) => ({
      source: term.source,
      target: term.target,
      targetLanguage: term.targetLang,
      caseSensitive: term.caseSensitive,
    })),
  )
}
