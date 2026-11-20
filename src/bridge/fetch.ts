// 渲染层 helper：把 fetch 调用转成 window.services.net.request，事件流还原成 Response。
// 契约见 ./contract.ts。不替换全局 fetch，只给需要的地方（如 AI SDK provider 的 fetch 选项）用。
import type { CreateBridgeFetch, NetErrorCode, NetEvent, NetRequest } from './contract.ts'

// 这些状态码的 Response 不能带 body（new Response 会抛 TypeError）。
const NULL_BODY_STATUS = new Set([204, 205, 304])

/** net 的 error 事件转成的错误；code 是 NetErrorCode。 */
class BridgeNetError extends Error {
  code: NetErrorCode
  constructor(code: NetErrorCode, message: string) {
    super(message)
    this.name = 'BridgeNetError'
    this.code = code
  }
}

/** 与 fetch 一致：用 signal.reason（默认是名为 AbortError 的 DOMException）拒绝。 */
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('This operation was aborted', 'AbortError')
}

/**
 * 调用方的 signal：init 里给了 signal 就用它，否则用 input（Request）自带的。
 * 直接监听它，而不是 new Request 派生出的 request.signal：Node 里派生 signal 只被 Request 对象持有，
 * Request 被回收后调用方的中止就传不过来了。
 */
function callerSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined {
  if (init && 'signal' in init) return init.signal ?? undefined
  return input instanceof Request ? input.signal : undefined
}

/** Request → NetRequest。body 按文本读出（契约里 body 是 string）。 */
async function toNetRequest(providerId: string, request: Request): Promise<NetRequest> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    throw new TypeError(`bridge fetch 只支持 GET 和 POST，收到 ${request.method}`)
  }
  return {
    taskId: crypto.randomUUID(),
    providerId,
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers),
    body: request.body ? await request.text() : undefined,
  }
}

export const createBridgeFetch: CreateBridgeFetch = (providerId) => {
  async function bridgeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const signal = callerSignal(input, init)
    if (signal?.aborted) throw abortReason(signal)
    // new Request 负责合并 input 与 init、规范化 method 和头名。
    const netRequest = await toNetRequest(providerId, new Request(input, init))
    if (signal?.aborted) throw abortReason(signal)
    const { net } = window.services

    return new Promise<Response>((resolve, reject) => {
      let finished = false // 收到终止事件、被中止或 body 被取消之后，忽略后续事件
      let body: ReadableStreamDefaultController<Uint8Array> | undefined
      const finish = () => {
        finished = true
        signal?.removeEventListener('abort', onAbort)
      }
      // 没拿到 head 时拒绝 fetch 的 Promise；拿到之后让 body 流出错。
      const fail = (error: unknown) => (body ? body.error(error) : reject(error))
      const stop = (error: unknown) => {
        finish()
        net.cancel(netRequest.taskId)
        fail(error)
      }
      const onAbort = () => stop(abortReason(signal!))
      signal?.addEventListener('abort', onAbort)

      const onHead = (status: number, headers: Record<string, string>) => {
        if (NULL_BODY_STATUS.has(status)) {
          finish()
          resolve(new Response(null, { status, headers }))
          return
        }
        const stream = new ReadableStream<Uint8Array>({
          start: (controller) => { body = controller },
          // 调用方不再读 body（reader.cancel / 流被丢弃）时，让 preload 也停下。
          cancel: () => {
            if (finished) return
            finish()
            net.cancel(netRequest.taskId)
          },
        })
        resolve(new Response(stream, { status, headers }))
      }

      const onEvent = (event: NetEvent) => {
        if (finished) return
        switch (event.type) {
          case 'head':
            try {
              onHead(event.status, event.headers)
            } catch (error) {
              stop(error) // 例如上游给了 Response 不接受的状态码
            }
            break
          case 'chunk':
            body?.enqueue(event.data)
            break
          case 'done':
            finish()
            body?.close()
            break
          case 'error':
            finish()
            fail(new BridgeNetError(event.code, event.message))
            break
        }
      }

      try {
        net.request(netRequest, onEvent)
      } catch (error) {
        finish()
        reject(error)
      }
    })
  }
  return bridgeFetch as typeof fetch
}
