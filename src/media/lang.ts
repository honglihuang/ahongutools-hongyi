// 语言名展示。语言方向用 src/entry/prefs.ts 的 getPrefs().direction。

/** ISO 639-3 → 中文语言名（如 'eng' → '英语'）；不认识的码原样返回。 */
export function langName(code: string): string {
  try {
    return new Intl.DisplayNames(['zh'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
