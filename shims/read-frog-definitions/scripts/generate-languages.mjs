// 生成 src/languages.generated.ts。来源与许可见 ../SOURCES.md。
// 用法：node scripts/generate-languages.mjs <上游 Read Frog 仓库目录> [iso-639-3.tab] [iso-639-3-macrolanguages.tab]
// 不传 .tab 路径时从 SIL 官方地址下载（只在本机生成时读取，不随仓库分发）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SIL_CODES_URL = 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab'
const SIL_MACRO_URL = 'https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3-macrolanguages.tab'

const [upstreamDir, codesTab, macroTab] = process.argv.slice(2)
if (!upstreamDir) throw new Error('缺少参数：上游 Read Frog 仓库目录')

async function readTab(file, url) {
  const text = file ? fs.readFileSync(file, 'utf8') : await (await fetch(url)).text()
  return text.split(/\r?\n/).slice(1).filter(Boolean).map((line) => line.split('\t'))
}

// 1. 语言码列表与英文名：上游 GPL 源码 src/locales/en.yml 的 languages 段（键 cmnHant 对应 cmn-Hant）。
const yml = fs.readFileSync(path.join(upstreamDir, 'src/locales/en.yml'), 'utf8').split(/\r?\n/)
const start = yml.indexOf('languages:')
if (start < 0) throw new Error('en.yml 里没有 languages 段')
const enNames = new Map()
for (const line of yml.slice(start + 1)) {
  if (!line.startsWith('  ')) break
  const m = /^ {2}([A-Za-z]+): (.+)$/.exec(line)
  if (!m || /["']/.test(m[2])) throw new Error(`无法解析的行：${line}`)
  enNames.set(m[1] === 'cmnHant' ? 'cmn-Hant' : m[1], m[2])
}
const codes = [...enNames.keys()]

// 2. ISO 639-3 → 639-1：SIL 码表 Part1 列；个体语言没有 Part1 时，
//    仅当 CLDR 别名数据（Intl.getCanonicalLocales）把它规范化为所属宏语言的 639-1 码时才采用。
const sil = new Map((await readTab(codesTab, SIL_CODES_URL)).map((c) => [c[0], c]))
const macroOf = new Map(
  (await readTab(macroTab, SIL_MACRO_URL)).filter((c) => c[2] === 'A').map((c) => [c[1], c[0]]),
)
const bcp47 = (code) =>
  code === 'cmn' ? 'zh-Hans' : code === 'cmn-Hant' ? 'zh-Hant' : Intl.getCanonicalLocales(code)[0]

const to6391 = {}
for (const code of codes) {
  if (code === 'cmn-Hant') {
    to6391[code] = 'zh-TW' // 上游 DeepL/DeepLX 适配代码按 'zh-TW' 识别繁体中文
    continue
  }
  const row = sil.get(code)
  if (!row) throw new Error(`SIL 码表里没有 ${code}`)
  let part1 = row[3] || undefined
  if (!part1) {
    const macro = macroOf.get(code)
    const macroPart1 = macro && sil.get(macro)?.[3]
    if (macroPart1 && new Intl.Locale(Intl.getCanonicalLocales(code)[0]).language === macroPart1)
      part1 = macroPart1
  }
  to6391[code] = part1
}
const options6391 = [...new Set(Object.values(to6391).filter(Boolean))]
const locale6393 = {}
for (const code of codes) if (to6391[code] && !(to6391[code] in locale6393)) locale6393[to6391[code]] = code

// 3. 本地语言名与书写方向：Intl.DisplayNames / Intl.Locale（Node 内置 ICU 的 CLDR 数据）。
const localeNames = {}
const rtl = []
for (const code of codes) {
  const tag = bcp47(code)
  const dn = new Intl.DisplayNames([tag], { type: 'language', fallback: 'none' })
  const supported = new Intl.Locale(dn.resolvedOptions().locale).language === new Intl.Locale(tag).language
  localeNames[code] = (supported && dn.of(tag)) || enNames.get(code) // CLDR 没有该语言的本地名时用英文名
  const max = new Intl.Locale(tag).maximize()
  if ((max.getTextInfo?.() ?? max.textInfo).direction === 'rtl') rtl.push(code)
}

const j = (v) => JSON.stringify(v)
const obj = (o) => `{\n${Object.entries(o).map(([k, v]) => `  ${j(k)}: ${v === undefined ? 'undefined' : j(v)},`).join('\n')}\n}`
const out = `// 由 scripts/generate-languages.mjs 生成，不要手改。来源与许可见 SOURCES.md。
// 生成环境：Node ${process.versions.node}，ICU ${process.versions.icu}，CLDR ${process.versions.cldr}。

export const LANG_CODE_ISO6393_OPTIONS = ${j(codes)} as const

export const LANG_CODE_ISO6391_OPTIONS = ${j(options6391)} as const

export type GeneratedLangCodeISO6393 = (typeof LANG_CODE_ISO6393_OPTIONS)[number]
export type GeneratedLangCodeISO6391 = (typeof LANG_CODE_ISO6391_OPTIONS)[number]

export const LANG_CODE_TO_EN_NAME: Record<GeneratedLangCodeISO6393, string> = ${obj(Object.fromEntries(enNames))}

export const LANG_CODE_TO_LOCALE_NAME: Record<GeneratedLangCodeISO6393, string> = ${obj(localeNames)}

export const ISO6393_TO_6391: Record<GeneratedLangCodeISO6393, GeneratedLangCodeISO6391 | undefined> = ${obj(to6391)}

export const LOCALE_TO_ISO6393: Partial<Record<GeneratedLangCodeISO6391, GeneratedLangCodeISO6393>> = ${obj(locale6393)}

export const RTL_LANG_CODES: readonly GeneratedLangCodeISO6393[] = ${j(rtl)}
`
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/languages.generated.ts')
fs.writeFileSync(target, out)
console.log(`wrote ${target}: ${codes.length} codes, ${options6391.length} ISO 639-1, ${rtl.length} RTL`)
