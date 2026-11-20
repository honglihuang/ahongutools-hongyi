// 术语表快照与指纹输入：读本机术语表（./repository.ts，存 localStore）。
// 与上游 entrypoints/background/glossary.ts 的 readSnapshot 相同，区别是 url 恒为 undefined：
// uTools 里没有网页，只有网址范围为空的术语表生效（决策：网址范围不适用）。
import type { LangCodeISO6393 } from '@read-frog/definitions'
import type { GlossarySnapshot } from '@/utils/glossary/active-matcher'
import { isGlossaryActiveForUrl } from '@/utils/glossary/scope'
import type { FingerprintGlossary, FingerprintTerm } from './fingerprint.ts'
import { getGlossaryRevision, listAllGlossaryTerms, listGlossaries, loadGlossaryEntries } from './repository.ts'

export const EMPTY_SNAPSHOT: GlossarySnapshot = { revision: 0, scopeKey: '', entries: [] }

export async function readSnapshot(targetLang: LangCodeISO6393): Promise<GlossarySnapshot> {
  const [revision, glossaries, entries] = await Promise.all([
    getGlossaryRevision(),
    listGlossaries(),
    loadGlossaryEntries(targetLang, undefined),
  ])
  const scopeKey = glossaries
    .filter((glossary) => isGlossaryActiveForUrl(glossary, undefined))
    .map((glossary) => glossary.id)
    .join(',')
  return { revision, scopeKey, entries }
}

/** 指纹要的全部术语表与术语（列表顺序，含停用的，由 fingerprint.ts 过滤）。 */
export async function readFingerprintRows(): Promise<{ glossaries: FingerprintGlossary[]; terms: FingerprintTerm[] }> {
  const [glossaries, terms] = await Promise.all([listGlossaries(), listAllGlossaryTerms()])
  return { glossaries, terms }
}
