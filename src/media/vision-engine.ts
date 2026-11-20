// 截图识别用哪个引擎：先取默认引擎（entry/default-engine.ts 的 resolveDefaultEngine，与其他入口同一个）。
// - 默认引擎是能收图片的 LLM 类型（IMAGE_PROVIDER_TYPES：Chat 请求里可以带图片内容）→ 用它识别 + 翻译；
// - 否则（默认引擎就是 uTools AI、DeepL 等非 LLM、DeepSeek 等不确定能收图片的类型）→ uTools AI 视觉模型；
// - 默认引擎识别失败（模型不收图片、请求体超过 preload 的 1 MB 上限、key 或网络问题）→ 改用 uTools AI 视觉模型。
// 结果里带 engine（实际用的引擎）与 fallback（没用上默认引擎的原因），界面要显示出来。取消（AbortError）不改用别的引擎。
// 原文与译文都经 soft-breaks.ts 合并段落内的屏幕折行（提示词也这样要求，这里兜底）；「重新翻译」用的就是合并后的原文。
// 这里不 import 上游 `@/` 模块（测试注入假的依赖）；上游接线在 vision-default.ts。
import type { DirectionPrefs } from '../engine/contract.ts'
import { type EngineCandidate, resolveDefaultEngine } from '../entry/default-engine.ts'
import { UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'
import { mergeSoftBreaks } from './soft-breaks.ts'
import { parseVisionReply, type VisionResult, visionPrompt } from './vision.ts'

const tidy = (r: VisionResult): VisionResult => ({ ...r, source: mergeSoftBreaks(r.source), translation: mergeSoftBreaks(r.translation) })

/** 按 OpenAI Chat 格式能带图片内容的 provider 类型（上游 AI SDK 会把图片转成 image_url / input_image）。 */
export const IMAGE_PROVIDER_TYPES: readonly string[] = ['openai-compatible', 'openai']

type Candidate = EngineCandidate & { name: string }

export type VisionPlan<T extends Candidate> =
  | { kind: 'provider'; provider: T }
  /** reason：默认引擎不是 uTools AI、却没用它的原因；默认引擎就是 uTools AI 时没有。 */
  | { kind: 'utools-ai'; reason?: string }

export function planVisionEngine<T extends Candidate>(providers: readonly T[], choice: string | null): VisionPlan<T> {
  const engine = resolveDefaultEngine(providers, choice)
  if (!engine || engine.id === UTOOLS_AI_PROVIDER_ID) return { kind: 'utools-ai' }
  if (!IMAGE_PROVIDER_TYPES.includes(engine.provider)) {
    return { kind: 'utools-ai', reason: `默认引擎「${engine.name}」不支持图片，已改用 uTools AI` }
  }
  return { kind: 'provider', provider: engine }
}

export interface VisionEngineResult extends VisionResult {
  /** 实际识别用的引擎；model 是模型 id（uTools AI 时是所选视觉模型）。 */
  engine: { id: string; name: string; model: string }
  /** 没用上默认引擎的原因；用上了（或默认引擎就是 uTools AI）时为 undefined。 */
  fallback?: string
}

export interface VisionDeps<T extends Candidate> {
  loadProviders(): Promise<T[]>
  getEngineChoice(): string | null
  modelOf(provider: T): string
  /** 用该 provider 发一条「提示词 + 图片」的消息，返回回复原文。 */
  askProvider(provider: T, prompt: string, imageDataUrl: string, signal?: AbortSignal): Promise<string>
  /** uTools AI 视觉模型识别（vision.ts 的 recognizeAndTranslate）。 */
  askUtools(imageDataUrl: string, opts: { model: string; direction: DirectionPrefs; signal?: AbortSignal }): Promise<VisionResult>
}

export interface RecognizeOptions {
  direction: DirectionPrefs
  /** 改用 uTools AI 时的视觉模型；空串 = uTools AI 没有视觉模型。 */
  utoolsModel: string
  signal?: AbortSignal
}

/** 发送前要告诉用户的引擎（截图视图的首次使用提示按它的 id 征求同意）。reason 同 VisionPlan。 */
export interface VisionTarget {
  id: string
  name: string
  model: string
  reason?: string
}

/** 按当前默认引擎算出截图会先发给谁；与 createRecognizeWithDefaultEngine 用同一个 planVisionEngine。 */
export function createPlanVisionTarget<T extends Candidate>(deps: Pick<VisionDeps<T>, 'loadProviders' | 'getEngineChoice' | 'modelOf'>) {
  return async (utoolsModel: string): Promise<VisionTarget> => {
    const plan = planVisionEngine(await deps.loadProviders(), deps.getEngineChoice())
    if (plan.kind === 'provider') return { id: plan.provider.id, name: plan.provider.name, model: deps.modelOf(plan.provider) }
    return { id: UTOOLS_AI_PROVIDER_ID, name: 'uTools AI', model: utoolsModel, reason: plan.reason }
  }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

export function createRecognizeWithDefaultEngine<T extends Candidate>(deps: VisionDeps<T>) {
  return async (imageDataUrl: string, { direction, utoolsModel, signal }: RecognizeOptions): Promise<VisionEngineResult> => {
    const plan = planVisionEngine(await deps.loadProviders(), deps.getEngineChoice())
    let fallback = plan.kind === 'utools-ai' ? plan.reason : undefined
    if (plan.kind === 'provider') {
      const p = plan.provider
      try {
        const reply = await deps.askProvider(p, visionPrompt(direction), imageDataUrl, signal)
        return { ...tidy(parseVisionReply(reply)), engine: { id: p.id, name: p.name, model: deps.modelOf(p) } }
      } catch (e) {
        if (isAbort(e) || signal?.aborted || !utoolsModel) throw e
        fallback = `默认引擎「${p.name}」识别失败（${errorText(e)}），已改用 uTools AI`
      }
    }
    if (!utoolsModel) {
      throw new Error(fallback ? `${fallback.replace(/，已改用 uTools AI$/, '')}；uTools AI 也没有视觉模型` : 'uTools AI 没有视觉模型，无法识别截图')
    }
    const r = await deps.askUtools(imageDataUrl, { model: utoolsModel, direction, signal })
    return { ...tidy(r), engine: { id: UTOOLS_AI_PROVIDER_ID, name: 'uTools AI', model: utoolsModel }, fallback }
  }
}
