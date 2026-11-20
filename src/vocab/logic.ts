// 生词本的纯函数：长度上限、判重键、搜索、排序与导出文本（不依赖上游，node --test 直接跑）。
import type { VocabEntry } from './contract.ts'
import { VOCAB_MAX_CHARS, VOCAB_MAX_WORDS } from './contract.ts'

// 中日韩文字不用空格分词：一整句没有空格也只算 1 个「词」，所以含这些文字时只按字符数判断。
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** 只对短文本开放：trim 后非空，且不超过 3 个词或不超过 30 个字符（满足其一）。含中日韩文字时只按字符数判断。 */
export function canAddToVocab(term: string): boolean {
  const t = term.trim()
  if (t === '') return false
  if ([...t].length <= VOCAB_MAX_CHARS) return true
  return !CJK.test(t) && t.split(/\s+/).length <= VOCAB_MAX_WORDS
}

/** 判重用的原文：小写、去首尾空白和首尾标点。 */
export function normalizeTerm(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '')
}

/**
 * 原文语言：franc 检测出来就用检测结果；短句经常检测不出（'und' 或 null），这时按文字类型猜：
 * 含假名 → 日语，含谚文 → 韩语，含汉字 → 中文，只有拉丁字母 → 英语（最常见的外语，保存前用户可改），其他 → 'und'。
 */
export function guessSourceLang(term: string, detected: string | null | undefined): string {
  if (detected && detected !== 'und') return detected
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term)) return 'jpn'
  if (/\p{Script=Hangul}/u.test(term)) return 'kor'
  if (/\p{Script=Han}/u.test(term)) return 'cmn'
  if (/\p{Script=Latin}/u.test(term)) return 'eng'
  return 'und'
}

/** 判重键：规范化原文 + 释义语言。 */
export function dedupeKey(term: string, targetLang: string): string {
  return `${normalizeTerm(term)}\u0000${targetLang}`
}

/** 新加的在前；同一时刻按 id 排，顺序稳定。 */
export function newestFirst(entries: readonly VocabEntry[]): VocabEntry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** 搜索：原文或释义包含关键词（不分大小写）；关键词为空时全部保留。 */
export function filterEntries(entries: readonly VocabEntry[], query: string): VocabEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...entries]
  return entries.filter((e) => e.term.toLowerCase().includes(q) || e.meaning.toLowerCase().includes(q))
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export const VOCAB_CSV_HEADER = 'term,meaning,sourceLang,targetLang,createdAt'

/** CSV：term,meaning,sourceLang,targetLang,createdAt（ISO 时间）。不含 BOM，保存时由调用方加。 */
export function formatVocabCsv(entries: readonly VocabEntry[]): string {
  const rows = entries.map((e) =>
    [csvField(e.term), csvField(e.meaning), e.sourceLang, e.targetLang, new Date(e.createdAt).toISOString()].join(','),
  )
  return [VOCAB_CSV_HEADER, ...rows].join('\n')
}

/** JSON：与本机存储同形（{ version: 1, entries }），缩进 2 格。 */
export function formatVocabJson(entries: readonly VocabEntry[]): string {
  return JSON.stringify({ version: 1, entries }, null, 2)
}
