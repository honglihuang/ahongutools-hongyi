// translateOnce 的逻辑部分（不依赖 React、不直接 import 上游模块，测试注入假的依赖）。
// 上游依赖的接线在 translate.ts。
// 术语表：只对 AI 引擎（isLLM）取原文里出现的术语，注入 system prompt；取术语出错时不带术语照常翻译。
// 提示词：与主界面下拉同一个选择（activePromptConfig），见决策「当前提示词只有一个」。
import type { Config } from '@/types/config/config'
import type { ProviderConfig } from '@/types/config/provider'
import type { MatchedTerm } from '@/utils/glossary/types'
import type { HongyiPrefs, TranslateOnce, TranslateOnceOptions } from './contract.ts'
import { resolveTargetLang } from '../engine/direction.ts'
import { resolveDefaultEngine } from './default-engine.ts'

type CustomPrompts = Config['pageTranslation']['customPromptsConfig']
type PromptConfig = { customPromptsConfig: CustomPrompts }
type PromptResult = { systemPrompt: string; prompt: string }

/** 内置提示词与上游 getHubPromptConfig（所选 id 既不是内置也不是自定义时回到默认）。 */
export interface PromptCatalog {
  defaultId: string
  builtIns: Readonly<Record<string, PromptResult>>
  hubPromptConfig(promptId: string, pagePrompts: CustomPrompts): CustomPrompts
}

export interface ActivePrompt extends PromptResult {
  id: string
  /** true = 用户自建的提示词（customPromptsConfig.patterns 里的一条）。 */
  custom: boolean
  name: string
}

/** 当前提示词：主界面下拉的选择优先，其次网页翻译的选择，都没有用默认（与上游 PromptSelector 同一规则）。 */
export function activePromptConfig(config: Config, catalog: PromptCatalog): CustomPrompts {
  const pagePrompts = config.pageTranslation.customPromptsConfig
  return catalog.hubPromptConfig(
    config.translationHub.promptId ?? pagePrompts.promptId ?? catalog.defaultId,
    pagePrompts,
  )
}

/** 当前提示词的内容；内置优先于同 id 的自定义（与上游 getTranslatePromptFromConfig 相同）。 */
export function activePrompt(config: Config, catalog: PromptCatalog): ActivePrompt {
  const { promptId, patterns } = activePromptConfig(config, catalog)
  const builtIn = Object.hasOwn(catalog.builtIns, promptId) ? catalog.builtIns[promptId] : undefined
  if (builtIn) return { id: promptId, systemPrompt: builtIn.systemPrompt, prompt: builtIn.prompt, custom: false, name: promptId }
  const custom = patterns.find((p) => p.id === promptId)
  if (custom) return { id: custom.id, systemPrompt: custom.systemPrompt, prompt: custom.prompt, custom: true, name: custom.name }
  const fallback = catalog.builtIns[catalog.defaultId]!
  return { id: catalog.defaultId, ...fallback, custom: false, name: catalog.defaultId }
}

export interface TranslateDeps {
  loadConfig(): Promise<Config>
  getPrefs(): HongyiPrefs
  /** 设置页选的默认引擎；null = 自动（见 default-engine.ts）。 */
  getEngineChoice(): string | null
  /** 上游 franc 检测（不调用 LLM）；检测不出返回 null。 */
  detect(text: string): Promise<string | null>
  catalog: PromptCatalog
  /** 上游 isLLMProviderConfig：只有 AI 引擎用术语表。 */
  isLLM(provider: ProviderConfig): boolean
  /** 上游 resolveGlossaryTerms：原文里出现的、适用于 targetLang（ISO 639-3）的术语。 */
  resolveTerms(input: string, enabled: boolean, targetLang: string): Promise<readonly MatchedTerm[]>
  prompt(config: PromptConfig, targetLang: string, input: string, glossaryTerms: readonly MatchedTerm[]): PromptResult
  execute(
    text: string,
    langConfig: Config['language'],
    provider: ProviderConfig,
    resolver: (targetLang: string, input: string) => Promise<PromptResult>,
    options: { signal?: AbortSignal },
  ): Promise<string>
}

interface Plan {
  config: Config
  provider: ProviderConfig
  target: string
  /** 给这次翻译取术语；不是 AI 引擎时恒为空。 */
  terms(input: string): Promise<readonly MatchedTerm[]>
}

function createPlanner(deps: TranslateDeps) {
  return async (text: string, opts: TranslateOnceOptions): Promise<Plan> => {
    const config = await deps.loadConfig()
    const provider =
      opts.providerId === undefined
        ? resolveDefaultEngine(config.providersConfig, deps.getEngineChoice())
        : config.providersConfig.find((p) => p.id === opts.providerId)
    if (!provider) {
      throw new Error(
        opts.providerId === undefined
          ? '没有可用的翻译引擎：请在「洪译设置」里添加或启用一个'
          : `找不到翻译引擎：${opts.providerId}`,
      )
    }
    const target = opts.target ?? resolveTargetLang((await deps.detect(text)) ?? undefined, deps.getPrefs().direction)
    const useTerms = config.glossary.enabled && deps.isLLM(provider)
    const terms = async (input: string): Promise<readonly MatchedTerm[]> => {
      if (!useTerms) return []
      try {
        return await deps.resolveTerms(input, true, target)
      } catch (error) {
        // 术语表坏了（库打不开等）只当没有术语，不让翻译失败。
        console.warn('[hongyi] 读取术语表失败，本次不带术语翻译', error)
        return []
      }
    }
    return { config, provider, target, terms }
  }
}

export function createTranslateOnce(deps: TranslateDeps): TranslateOnce {
  const plan = createPlanner(deps)
  return async (text, opts = {}) => {
    const { config, provider, target, terms } = await plan(text, opts)
    const langConfig = {
      sourceCode: 'auto',
      targetCode: target,
      level: config.language.level,
    } as Config['language']
    const promptConfig = { customPromptsConfig: activePromptConfig(config, deps.catalog) }
    // executeTranslate 把预处理过的原文交给 resolver，术语按它匹配（与上游主界面卡片相同）。
    const resolver = async (lang: string, input: string) => deps.prompt(promptConfig, lang, input, await terms(input))
    const out = await deps.execute(text, langConfig, provider, resolver, { signal: opts.signal })
    return { text: out, providerId: provider.id, target }
  }
}

/** translateOnce(text, opts) 会带上的术语（同一套引擎、目标语言与开关规则）；截图视图用它判断要不要按术语表重新翻译。 */
export function createMatchedTerms(deps: TranslateDeps) {
  const plan = createPlanner(deps)
  return async (text: string, opts: TranslateOnceOptions = {}): Promise<readonly MatchedTerm[]> => (await plan(text, opts)).terms(text)
}
