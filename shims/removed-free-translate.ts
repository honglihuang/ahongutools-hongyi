// 替换 upstream utils/host/translate/api/google.ts、google-legacy.ts、microsoft.ts（按解析后的绝对路径）。
// 决策 E2：删除 Google、Microsoft 的非官方免 key 接口与硬编码 key；原模块不进产物，调用即明确失败。
class FreeTranslateRemovedError extends Error {
  constructor(name: string) {
    super(`${name} (unofficial keyless endpoint) is removed in uTools; configure an official provider instead`)
    this.name = 'FreeTranslateRemovedError'
  }
}

export async function googleTranslate(): Promise<never> {
  throw new FreeTranslateRemovedError('Google Translate')
}

export async function googleTranslateLegacySingle(): Promise<never> {
  throw new FreeTranslateRemovedError('Google Translate')
}

export async function isGoogleTranslateReachable(): Promise<never> {
  throw new FreeTranslateRemovedError('Google Translate')
}

export async function microsoftTranslate(): Promise<never> {
  throw new FreeTranslateRemovedError('Microsoft Translator')
}
