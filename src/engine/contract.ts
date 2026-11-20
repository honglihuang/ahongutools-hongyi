// 我方翻译引擎模块的共享契约。实现方：W3（src/engine/）；使用方：W1 的上游集成层。
// 改动这个文件 = 改共享接口，必须先停下报告 advisor。

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface UtoolsAiRequest {
  messages: ChatMessage[]
  /** 不传则用 uTools 默认模型。 */
  model?: string
  /** 默认 'none'（翻译不需要思考，更快）。 */
  reasoningEffort?: ReasoningEffort
  signal?: AbortSignal
  /** 传入即流式：每次收到增量文本调用一次。 */
  onDelta?: (delta: string) => void
}

/** 实现在 src/engine/utools-ai.ts：`export async function utoolsAiGenerate(...)`。中止时以 name === 'AbortError' 的错误拒绝。 */
export type UtoolsAiGenerate = (req: UtoolsAiRequest) => Promise<{ text: string }>

export interface UtoolsAiModel {
  id: string
  label: string
  vision: boolean
}

/** 实现在 src/engine/utools-ai.ts：`export async function listUtoolsAiModels()`。 */
export type ListUtoolsAiModels = () => Promise<UtoolsAiModel[]>

/** utools.ai 在上游 provider 体系里冒充的 OpenAI 兼容端点。 */
export const UTOOLS_AI_BASE_URL = 'https://utools-ai.invalid/v1'

/**
 * 实现在 src/engine/utools-ai-fetch.ts：`export function createUtoolsAiFetch(): typeof fetch`。
 * 只接受 `${UTOOLS_AI_BASE_URL}/chat/completions` 的 POST（OpenAI Chat Completions 请求体，含 stream: true/false），
 * 用 utoolsAiGenerate 完成，返回 OpenAI 兼容的 JSON 或 SSE 响应；其他 URL 以 404 Response 返回。
 * 用途：让上游的 openai-compatible provider 不改源码就能用 utools.ai。
 */
export type CreateUtoolsAiFetch = () => typeof fetch

/** 语言码一律 ISO 639-3（与上游 LangCodeISO6393 一致，如 'cmn'、'eng'、'jpn'）。 */
export interface DirectionPrefs {
  /** 母语，默认 'cmn' */
  native: string
  /** 常用外语，默认 'eng' */
  foreign: string
}

/**
 * 实现在 src/engine/direction.ts：`export function resolveTargetLang(...)`。
 * 规则：检测到的语言 ≠ 母语 → 译成母语；= 母语 → 译成常用外语；检测不出 → 译成母语。
 */
export type ResolveTargetLang = (detected: string | undefined, prefs: DirectionPrefs) => string
