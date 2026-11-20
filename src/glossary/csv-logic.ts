// 术语表 CSV 导入导出的文案与文件名（纯函数，node --test 直接跑）。
import type { GlossaryCsvSkip } from '@/utils/glossary/csv'
import type { ImportGlossaryResult } from './repository.ts'

const SKIP_REASONS: Record<GlossaryCsvSkip['reason'], string> = {
  empty: '原文为空',
  'too-long': '原文或译文超过 200 字',
  'unknown-language': '目标语言不认识（要写 ISO 639-3 代码如 cmn、eng，或 all）',
  'missing-field': '区分大小写一栏不是 true / false',
}

/** 跳过的行：「第 3 行：原文为空」，按行号排序。 */
export function skippedLines(skipped: readonly GlossaryCsvSkip[]): string[] {
  return [...skipped].sort((a, b) => a.line - b.line).map((s) => `第 ${s.line} 行：${SKIP_REASONS[s.reason]}`)
}

export const MISSING_HEADER = '不是洪译术语表 CSV：第一行要是 source,target,targetLanguage,caseSensitive'

export function importSummary(r: ImportGlossaryResult): string {
  if (!r.ok) {
    return r.reason === 'overflow'
      ? `导入被拒绝：超出术语总数上限 ${r.overflowBy ?? 0} 条，术语表未改动`
      : '导入被拒绝：文件里没有可导入的行，术语表未改动'
  }
  const dup = r.duplicatesInFile > 0 ? `，文件内重复 ${r.duplicatesInFile} 行（以后出现的为准）` : ''
  return `已导入：新增 ${r.added} 条，更新 ${r.updated} 条${dup}`
}

/** 导出文件名：Windows 文件名里不能有的字符换成下划线。 */
export function exportFileName(glossaryName: string): string {
  const safe = glossaryName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '未命名'
  return `洪译术语表-${safe}.csv`
}
