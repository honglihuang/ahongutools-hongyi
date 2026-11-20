// 运行一个 AI 动作：默认引擎（planActionEngine），AI SDK streamText 出纯文本，逐段回调。
// 参数与 media/vision-default.ts 相同（temperature、reasoning、providerOptions、maxRetries 0、abortSignal）。
// 不用 Output.object、不要求 JSON、不调用 buildSelectionToolbarCustomActionSystemPrompt（它会追加 JSON 输出约定）。
// uTools AI 也走同一个模型工厂：vite.config.ts 注入的 fetchForProvider 把它接到 createUtoolsAiFetch（支持流式）。
import type { LLMProviderConfig, ProviderConfig } from '@/types/config/provider'
import { streamText } from 'ai'
import { isLLMProviderConfig } from '@/types/config/provider'
import { replaceSelectionToolbarCustomActionPromptTokens } from '@/utils/custom-action-prompt'
import { extractAISDKErrorMessage } from '@/utils/error/extract-message'
import { getLanguageModelForConfig } from '@/utils/providers/model'
import { resolveModelId } from '@/utils/providers/model-id'
import { getProviderOptionsWithOverride } from '@/utils/providers/options'
import { getTopLevelReasoning } from '@/utils/providers/reasoning'
import { UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'
import { langName } from '../media/lang.ts'
import { type CustomAction, planActionEngine } from './logic.ts'

export interface ActionTarget {
  /** 实际要用的引擎配置；uTools AI 时是配置里的 utools-ai 行。 */
  config: LLMProviderConfig
  name: string
  isUtoolsAi: boolean
  /** 没用默认引擎的原因。 */
  reason?: string
}

/** 按当前默认引擎算出动作会发给谁；uTools AI 在配置里不存在或已停用时报错。 */
export function resolveActionTarget(providers: readonly ProviderConfig[], choice: string | null): ActionTarget {
  const plan = planActionEngine(providers, choice, isLLMProviderConfig)
  if (plan.kind === 'provider' && isLLMProviderConfig(plan.provider)) {
    return { config: plan.provider, name: plan.provider.name, isUtoolsAi: false }
  }
  const reason = plan.kind === 'utools-ai' ? plan.reason : undefined
  const row = providers.find((p) => p.id === UTOOLS_AI_PROVIDER_ID)
  if (!row || !row.enabled || !isLLMProviderConfig(row)) {
    throw new Error(`${reason ? `${reason}，但` : ''}uTools AI 已停用或不存在，没有可用的引擎`)
  }
  return { config: row, name: row.name, isUtoolsAi: true, reason }
}

/** 占位符替换：selection、paragraphs → 输入文字；targetLanguage → 母语的中文名；网页相关的三个 → 空串。 */
export function fillPrompts(action: Pick<CustomAction, 'systemPrompt' | 'prompt'>, text: string, nativeLang: string) {
  const tokens = { selection: text, paragraphs: text, targetLanguage: langName(nativeLang), webTitle: '', webUrl: '', webContent: '' }
  return {
    system: replaceSelectionToolbarCustomActionPromptTokens(action.systemPrompt, tokens).trim(),
    prompt: replaceSelectionToolbarCustomActionPromptTokens(action.prompt, tokens).trim(),
  }
}

export interface RunOptions {
  onText(text: string): void
  signal?: AbortSignal
}

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

/** 流式运行，onText 收到累计文本；返回最终文本。取消时抛 AbortError，其他错误抛成可读的 Error。 */
export async function runAction(
  target: ActionTarget,
  action: Pick<CustomAction, 'systemPrompt' | 'prompt'>,
  text: string,
  nativeLang: string,
  { onText, signal }: RunOptions,
): Promise<string> {
  const { config } = target
  const { system, prompt } = fillPrompts(action, text, nativeLang)
  const modelName = resolveModelId(config.model) ?? ''
  const reasoning = getTopLevelReasoning(config)
  let streamError: unknown
  let out = ''
  try {
    const result = streamText({
      model: getLanguageModelForConfig(config),
      ...(system ? { instructions: system } : {}),
      prompt: prompt || text,
      reasoning,
      temperature: config.temperature,
      providerOptions: getProviderOptionsWithOverride(modelName, config.provider, config.providerOptions, reasoning),
      abortSignal: signal,
      maxRetries: 0,
      onError: ({ error }) => {
        streamError = error
      },
    })
    for await (const delta of result.textStream) {
      out += delta
      onText(out)
    }
  } catch (e) {
    if (isAbort(e) || signal?.aborted) throw e
    throw new Error(extractAISDKErrorMessage(e))
  }
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  if (streamError !== undefined) {
    if (isAbort(streamError)) throw streamError
    throw new Error(extractAISDKErrorMessage(streamError))
  }
  return out
}
