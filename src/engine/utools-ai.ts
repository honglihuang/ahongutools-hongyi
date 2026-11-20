import type { ListUtoolsAiModels, UtoolsAiGenerate, UtoolsAiModel } from './contract.ts'

// 以下类型按 uTools 文档 api-reference/ai.md 定义，不用 utools-api-types：
// 该 d.ts 的 AiOptions 没有 reasoning_effort 字段，文档有，按文档实现。
interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content?: string
  reasoning_content?: string
}

interface AiOptions {
  model?: string
  messages: AiMessage[]
  reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

interface AiPromise<T> extends Promise<T> {
  abort(): void
}

interface AiModel {
  id: string
  label: string
  icon: string
  cost?: number
  vision?: boolean
}

interface UtoolsAiApi {
  ai(options: AiOptions): AiPromise<AiMessage>
  ai(options: AiOptions, streamCallback: (chunk: AiMessage) => void): AiPromise<void>
  allAiModels(): Promise<AiModel[]>
}

function getUtools(): UtoolsAiApi {
  const api = (globalThis as { utools?: UtoolsAiApi }).utools
  if (!api) throw new Error('utools API is not available')
  return api
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

export async function utoolsAiGenerate(
  ...[{ messages, model, reasoningEffort, signal, onDelta }]: Parameters<UtoolsAiGenerate>
): ReturnType<UtoolsAiGenerate> {
  if (signal?.aborted) throw abortError()

  const options: AiOptions = {
    messages: messages.map(({ role, content }) => ({ role, content })),
    reasoning_effort: reasoningEffort ?? 'none',
  }
  if (model) options.model = model

  const utools = getUtools()
  let aborted = false
  let text = ''
  let call: AiPromise<AiMessage | void>
  if (onDelta) {
    // 只取 chunk.content（按增量处理），reasoning_content 不进译文。
    call = utools.ai(options, (chunk) => {
      if (aborted || !chunk.content) return
      text += chunk.content
      onDelta(chunk.content)
    })
  } else {
    call = utools.ai(options)
  }

  return new Promise<{ text: string }>((resolve, reject) => {
    const onAbort = () => {
      aborted = true
      call.abort()
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    call.then(
      (result) => {
        signal?.removeEventListener('abort', onAbort)
        resolve({ text: onDelta ? text : ((result as AiMessage | undefined)?.content ?? '') })
      },
      (error: unknown) => {
        signal?.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

export async function listUtoolsAiModels(): ReturnType<ListUtoolsAiModels> {
  const models = await getUtools().allAiModels()
  return models.map((m): UtoolsAiModel => ({ id: m.id, label: m.label, vision: m.vision === true }))
}
