// `@webext-core/messaging` 的替代：进程内 sendMessage/onMessage。
// 没有 handler 的 key 一律以「not supported in uTools」拒绝，不伪造成功；handler 在 src/upstream-adapter/messages.ts 注册。
type Handler = (message: { data: unknown }) => unknown
// 按上游 ProtocolMap（key → (data) => 返回值）推出 sendMessage / onMessage 的参数与返回类型。
type AnyFn = (...args: any[]) => any
type DataOf<F> = F extends AnyFn ? Parameters<F>[0] : unknown
type ReturnOf<F> = F extends AnyFn ? Awaited<ReturnType<F>> : unknown

const handlers = new Map<string, Handler>()

export class UnsupportedMessageError extends Error {
  constructor(type: string) {
    super(`message "${type}" is not supported in uTools`)
    this.name = 'UnsupportedMessageError'
  }
}

export function defineExtensionMessaging<ProtocolMap = Record<string, AnyFn>>() {
  return {
    async sendMessage<K extends keyof ProtocolMap & string>(
      type: K,
      ...args: DataOf<ProtocolMap[K]> extends undefined ? [data?: DataOf<ProtocolMap[K]>] : [data: DataOf<ProtocolMap[K]>]
    ): Promise<ReturnOf<ProtocolMap[K]>> {
      const handler = handlers.get(type)
      if (!handler) throw new UnsupportedMessageError(type)
      return (await handler({ data: args[0] })) as ReturnOf<ProtocolMap[K]>
    },
    onMessage<K extends keyof ProtocolMap & string>(
      type: K,
      handler: (message: { data: DataOf<ProtocolMap[K]> }) => ReturnOf<ProtocolMap[K]> | Promise<ReturnOf<ProtocolMap[K]>>,
    ): () => void {
      if (handlers.has(type)) throw new Error(`message "${type}" already has a handler`)
      handlers.set(type, handler as Handler)
      return () => handlers.delete(type)
    },
    removeAllListeners(): void {
      handlers.clear()
    },
  }
}
