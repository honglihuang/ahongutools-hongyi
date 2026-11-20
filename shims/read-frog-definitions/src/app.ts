// Read Frog 账号、云 API、扩展页面握手相关的常量。名字和字面量类型按 @read-frog/definitions@0.12.0 的 d.ts 对齐；
// uTools 插件不调用 Read Frog 云服务，这些值只为让上游代码能编译、运行。
export const APP_NAME = 'Read Frog'

export const AUTH_BASE_PATH = '/api/identity'
export const ORPC_PREFIX = '/api/rpc'
export const AUTH_COOKIE_PATTERNS = ['better-auth.session_token'] as const

export const CLIENT_CONTEXT_HEADER = 'x-read-frog-client-context'
export const NOTE_SAVE_SURFACES = ['custom_action', 'note_suggestion'] as const
export type NoteSaveSurface = (typeof NOTE_SAVE_SURFACES)[number]

export interface ClientContextHeaderInput {
  surface?: NoteSaveSurface
  isGuide?: boolean
}

/** 结构化字段字典（RFC 8941），如 `surface=note_suggestion, guide`；没有内容时返回 undefined。 */
export function formatClientContextHeader(input: ClientContextHeaderInput): string | undefined {
  const members: string[] = []
  if (input.surface) members.push(`surface=${input.surface}`)
  if (input.isGuide) members.push('guide')
  return members.length > 0 ? members.join(', ') : undefined
}

export const EXTENSION_STATUS_REQUEST_SOURCE = 'read-frog-page'
export const EXTENSION_STATUS_RESPONSE_SOURCE = 'read-frog-ext'
export const EXTENSION_STATUS_REQUEST_TYPE = 'getExtensionStatus'
export const EXTENSION_STATUS_RESPONSE_TYPE = 'extensionStatus'

export interface ExtensionStatusResponse {
  source: typeof EXTENSION_STATUS_RESPONSE_SOURCE
  type: typeof EXTENSION_STATUS_RESPONSE_TYPE
  requestId: string
  data: { version: string }
}

export type ReviewEntrySource =
  | 'home'
  | 'notebase_detail'
  | 'extension_selection_translation'
  | 'extension_custom_ai_action'
  | 'phone_qr'
