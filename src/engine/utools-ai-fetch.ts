import type { ChatMessage, CreateUtoolsAiFetch, ReasoningEffort, UtoolsAiRequest } from './contract.ts'
import { UTOOLS_AI_BASE_URL } from './contract.ts'
import { utoolsAiGenerate } from './utools-ai.ts'

const CHAT_COMPLETIONS_URL = `${UTOOLS_AI_BASE_URL}/chat/completions`
const REASONING_EFFORTS: readonly ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const ROLES: readonly ChatMessage['role'][] = ['system', 'user', 'assistant']

class BadRequest extends Error {}

function errorResponse(status: number, type: string, message: string): Response {
  return Response.json({ error: { message, type, param: null, code: null } }, { status })
}

function textOf(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part: { type?: unknown, text?: unknown }) => {
        if (part?.type !== 'text' || typeof part.text !== 'string')
          throw new BadRequest(`unsupported content part type: ${String(part?.type)}`)
        return part.text
      })
      .join('')
  }
  throw new BadRequest('message content must be a string or an array of text parts')
}

function parseBody(body: unknown): Omit<UtoolsAiRequest, 'signal' | 'onDelta'> & { stream: boolean } {
  if (typeof body !== 'object' || body === null) throw new BadRequest('request body must be a JSON object')
  const { messages, model, stream, reasoning_effort } = body as Record<string, unknown>
  if (!Array.isArray(messages) || messages.length === 0) throw new BadRequest('messages must be a non-empty array')
  const parsed = messages.map((m: { role?: unknown, content?: unknown }): ChatMessage => {
    if (!ROLES.includes(m?.role as ChatMessage['role'])) throw new BadRequest(`unsupported role: ${String(m?.role)}`)
    return { role: m.role as ChatMessage['role'], content: textOf(m.content) }
  })
  if (model != null && typeof model !== 'string') throw new BadRequest('model must be a string')
  if (reasoning_effort != null && !REASONING_EFFORTS.includes(reasoning_effort as ReasoningEffort))
    throw new BadRequest(`unsupported reasoning_effort: ${String(reasoning_effort)}`)
  return {
    messages: parsed,
    model: model || undefined,
    reasoningEffort: (reasoning_effort ?? undefined) as ReasoningEffort | undefined,
    stream: stream === true,
  }
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createUtoolsAiFetch(): ReturnType<CreateUtoolsAiFetch> {
  return async (input, init) => {
    const request = new Request(input, init)
    if (request.url !== CHAT_COMPLETIONS_URL)
      return errorResponse(404, 'invalid_request_error', `unknown endpoint: ${request.url}`)
    if (request.method !== 'POST')
      return errorResponse(405, 'invalid_request_error', `method not allowed: ${request.method}`)

    let req: ReturnType<typeof parseBody>
    try {
      req = parseBody(await request.json())
    } catch (error) {
      return errorResponse(400, 'invalid_request_error', messageOf(error))
    }

    const id = `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    const created = Math.floor(Date.now() / 1000)
    const model = req.model ?? 'utools-ai'
    const base = { messages: req.messages, model: req.model, reasoningEffort: req.reasoningEffort, signal: request.signal }

    if (!req.stream) {
      try {
        const { text } = await utoolsAiGenerate(base)
        return Response.json({
          id,
          object: 'chat.completion',
          created,
          model,
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        })
      } catch (error) {
        if (isAbortError(error)) throw error
        return errorResponse(502, 'api_error', messageOf(error))
      }
    }

    return streamResponse(base, { id, created, model })
  }
}

// 等到第一段增量或调用结束再返回响应：开始输出前的失败映射成 HTTP 错误状态码，之后的失败作为 SSE 错误事件发出。
async function streamResponse(
  base: Omit<UtoolsAiRequest, 'onDelta'>,
  meta: { id: string, created: number, model: string },
): Promise<Response> {
  const encoder = new TextEncoder()
  const pending: Uint8Array[] = []
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const send = (data: unknown) => {
    const bytes = encoder.encode(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
    if (controller) controller.enqueue(bytes)
    else pending.push(bytes)
  }
  const chunk = (delta: Record<string, string>, finishReason: string | null) => ({
    id: meta.id,
    object: 'chat.completion.chunk',
    created: meta.created,
    model: meta.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })

  let started = false
  let markStarted!: () => void
  const firstDelta = new Promise<void>((resolve) => { markStarted = resolve })
  const done = utoolsAiGenerate({
    ...base,
    onDelta: (delta) => {
      if (!started) send(chunk({ role: 'assistant', content: '' }, null))
      started = true
      send(chunk({ content: delta }, null))
      markStarted()
    },
  })

  const settled = done.then(() => true, () => true)
  await Promise.race([firstDelta, settled])
  if (!started) {
    try {
      await done
      send(chunk({ role: 'assistant', content: '' }, null))
    } catch (error) {
      if (isAbortError(error)) throw error
      return errorResponse(502, 'api_error', messageOf(error))
    }
  }

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
      for (const bytes of pending.splice(0)) c.enqueue(bytes)
      done.then(
        () => {
          send(chunk({}, 'stop'))
          send('[DONE]')
          c.close()
        },
        (error: unknown) => {
          if (isAbortError(error)) {
            c.error(error)
            return
          }
          send({ error: { message: messageOf(error), type: 'api_error', param: null, code: null } })
          c.close()
        },
      )
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
  })
}
