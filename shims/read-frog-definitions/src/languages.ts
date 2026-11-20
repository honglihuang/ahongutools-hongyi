import { z } from 'zod'
import { LANG_CODE_ISO6393_OPTIONS, LOCALE_TO_ISO6393 } from './languages.generated.ts'

export {
  ISO6393_TO_6391,
  LANG_CODE_ISO6391_OPTIONS,
  LANG_CODE_ISO6393_OPTIONS,
  LANG_CODE_TO_EN_NAME,
  LANG_CODE_TO_LOCALE_NAME,
  LOCALE_TO_ISO6393,
  RTL_LANG_CODES,
} from './languages.generated.ts'
export type {
  GeneratedLangCodeISO6391 as LangCodeISO6391,
  GeneratedLangCodeISO6393 as LangCodeISO6393,
} from './languages.generated.ts'

export const langCodeISO6393Schema = z.enum(LANG_CODE_ISO6393_OPTIONS)

export const langLevel = z.enum(['beginner', 'intermediate', 'advanced'])
export type LangLevel = z.infer<typeof langLevel>

type Code = (typeof LANG_CODE_ISO6393_OPTIONS)[number]
const BY_LOWERCASE = new Map<string, Code>(LANG_CODE_ISO6393_OPTIONS.map((code) => [code.toLowerCase(), code]))
const BY_LOCALE = new Map<string, Code>(
  Object.entries(LOCALE_TO_ISO6393).map(([locale, code]) => [locale.toLowerCase(), code as Code]),
)
const TRADITIONAL_CHINESE_REGIONS = new Set(['hk', 'mo', 'tw'])

/** BCP 47 标签或 ISO 639-3 码对应的语言；不在语言表里返回 null。大小写、`_`/`-`、POSIX 编码后缀不影响结果。 */
export function speechLanguageFromTag(tag: string | null | undefined): Code | null {
  const token = tag?.replace(/\..*$/, '').replace(/_/g, '-').trim().toLowerCase()
  if (!token) return null
  const exact = BY_LOWERCASE.get(token) ?? BY_LOCALE.get(token)
  if (exact) return exact
  const parts = token.split('-').filter(Boolean)
  if (parts[0] === 'zh' || parts[0] === 'cmn') {
    if (parts.includes('yue')) return 'yue'
    if (parts.includes('hant') || parts.some((p) => TRADITIONAL_CHINESE_REGIONS.has(p))) return 'cmn-Hant'
    return 'cmn'
  }
  return BY_LOWERCASE.get(parts[0]!) ?? BY_LOCALE.get(parts[0]!) ?? null
}
