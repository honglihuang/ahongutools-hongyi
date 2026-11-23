// preload ↔ 渲染层的共享契约。实现方：preload/ 与 src/bridge/（W2）；使用方：其余所有代码。
// 改动这个文件 = 改共享接口，必须先停下报告 advisor。

/** API key 的占位符。渲染层永远只拿到它，真实 key 只在 preload 里替换进请求头。 */
export type SecretRef = `{{secret:${string}}}`

export type NetworkEngineType = 'openai-compatible' | 'deepseek' | 'openai' | 'deepl' | 'deeplx' | 'ollama'

export interface EngineAccessApi {
  /** 保存本机绑定；固定引擎由 preload 选地址，自定义端点需在原生对话框确认。key 留空保留已绑定的 key。 */
  save(providerId: string, type: NetworkEngineType, baseURL: string, key: string): Promise<{ baseURL: string; hasKey: boolean }>
  has(providerId: string): Promise<boolean>
  remove(providerId: string): Promise<void>
  /** 返回占位符，不返回 key。 */
  ref(providerId: string): SecretRef
}

export interface NetRequest {
  taskId: string
  providerId: string
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
  timeoutMs?: number
}

export type NetEvent =
  | { type: 'head'; status: number; headers: Record<string, string> }
  | { type: 'chunk'; data: Uint8Array }
  | { type: 'done' }
  | { type: 'error'; code: NetErrorCode; message: string }

export type NetErrorCode =
  | 'ORIGIN_NOT_ALLOWED'
  | 'SECRET_MISSING'
  | 'REDIRECT_BLOCKED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'TOO_LARGE'
  | 'NETWORK'

export interface NetApi {
  /** 仅允许向该 providerId 的已授权端点发 POST；done/error 之后不再有事件。 */
  request(req: NetRequest, onEvent: (event: NetEvent) => void): void
  cancel(taskId: string): void
}

/**
 * 渲染层 helper，实现在 src/bridge/fetch.ts：`export const createBridgeFetch: CreateBridgeFetch`。
 * 返回的函数与 fetch 签名兼容，可直接作为 AI SDK provider 的 `fetch` 选项：
 * head → Response 的 status/headers，chunk → body 的 ReadableStream，init.signal 中止 → net.cancel(taskId)，
 * error 事件 → 以 Error 拒绝（error.code 为 NetErrorCode）。
 */
export type CreateBridgeFetch = (providerId: string) => typeof fetch

/** 本机、不同步的应用数据（翻译缓存、历史记录），存 getPluginLocalDataPath() 下。 */
export interface LocalStoreApi {
  get<T = unknown>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

/** 文件翻译用（第二阶段，实现 public/preload/files.js，P3）。只处理 txt/md/srt。 */
export interface FilesApi {
  /** 读取 UTF-8（含 BOM 处理）文本；扩展名不是 txt/md/srt、不是文件或超过 maxBytes（默认 512 KiB）时拒绝。 */
  readText(path: string, maxBytes?: number): Promise<{ text: string; bytes: number }>
  /** 弹出 utools.showSaveDialog 让用户选路径并写入；用户取消返回 null；不覆盖源文件（路径与 avoidPath 相同则拒绝）。 */
  saveTextAs(defaultPath: string, content: string, avoidPath?: string): Promise<string | null>
}

export interface HongyiServices {
  engines: EngineAccessApi
  net: NetApi
  localStore: LocalStoreApi
  files: FilesApi
}

/** 上游代码想打开设置页时（如服务下拉里的设置按钮）派发的事件，入口层（P1）监听并切换到 settings 视图。 */
export const OPEN_VIEW_EVENT = 'hongyi:open-view'

declare global {
  interface Window {
    services: HongyiServices
  }
}
