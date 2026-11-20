// 契约 TranslateOnce 的实现：复用上游 executeTranslate 与当前配置；默认引擎由 default-engine.ts 的 resolveDefaultEngine 决定。
// 目标语言不传时：上游 detectLanguage（franc，不调用 LLM）+ resolveTargetLang + HongyiPrefs.direction。
// 术语：上游 resolveGlossaryTerms（快照由 src/glossary/startup.ts 设的 loader 从本机 localStore 读）；提示词：与主界面下拉同一个选择。
import type { LangCodeISO6393 } from '@read-frog/definitions'
import { getHubPromptConfig } from '@/entrypoints/translation-hub/prompt'
import { isLLMProviderConfig } from '@/types/config/provider'
import { getLocalConfig } from '@/utils/config/storage'
import { DEFAULT_CONFIG } from '@/utils/constants/config'
import { BUILT_IN_PAGE_TRANSLATE_PROMPTS, DEFAULT_TRANSLATE_PROMPT_ID } from '@/utils/constants/prompt'
import { detectLanguage } from '@/utils/content/language'
import { resolveGlossaryTerms } from '@/utils/glossary/active-matcher'
import { executeTranslate } from '@/utils/host/translate/execute-translate'
import { getTranslatePromptFromConfig } from '@/utils/prompts/translate'
import { getEngineChoice } from './default-engine.ts'
import { getPrefs } from './prefs.ts'
import type { PromptCatalog, TranslateDeps } from './translate-core.ts'
import { activePrompt, createMatchedTerms, createTranslateOnce } from './translate-core.ts'

export const promptCatalog: PromptCatalog = {
  defaultId: DEFAULT_TRANSLATE_PROMPT_ID,
  builtIns: BUILT_IN_PAGE_TRANSLATE_PROMPTS,
  hubPromptConfig: getHubPromptConfig,
}

const deps: TranslateDeps = {
  loadConfig: async () => (await getLocalConfig()) ?? DEFAULT_CONFIG,
  getPrefs,
  getEngineChoice,
  detect: (text) => detectLanguage(text, { minLength: 1, enableLLM: false }),
  catalog: promptCatalog,
  isLLM: isLLMProviderConfig,
  resolveTerms: async (input, enabled, targetLang) =>
    (await resolveGlossaryTerms(input, enabled, targetLang as LangCodeISO6393)).terms,
  prompt: (config, lang, input, glossaryTerms) => getTranslatePromptFromConfig(config, lang, input, { glossaryTerms }),
  execute: (text, langConfig, provider, resolver, options) =>
    executeTranslate(text, langConfig, provider, resolver, options),
}

export const translateOnce = createTranslateOnce(deps)

/** translateOnce(text, opts) 会带上的术语。 */
export const matchedTermsFor = createMatchedTerms(deps)

/** 当前提示词（主界面下拉、设置页、translateOnce 共用的那一个）。 */
export const currentPrompt = async () => activePrompt(await deps.loadConfig(), promptCatalog)
