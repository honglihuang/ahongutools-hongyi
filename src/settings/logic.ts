// 设置页的纯逻辑（不依赖 React 与上游 `@/` 模块，可直接 node --test）。
// 端点授权和 key 由 preload 管理；同步配置里只有占位符。
import type { EngineAccessApi, NetworkEngineType } from '../bridge/contract.ts'
import { UTOOLS_AI_DEFAULT_MODEL, UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'

export type KeyMode = 'required' | 'optional' | 'none'

export interface EngineMeta {
  label: string
  /** required：必须有 key；optional：可不填（如本机 LM Studio）；none：不收 key。 */
  keyMode: KeyMode
  /** 是否有模型字段；customModelOnly = 必须填模型名（上游 openai-compatible 只接受自定义模型）。 */
  model: 'none' | 'optional' | 'customModelOnly'
  /** 地址由 preload 选定，不让用户填。 */
  fixedEndpoint?: true
}

export type EngineType = NetworkEngineType

/** 设置页可添加的引擎（决策 E3）。键是上游 provider 类型。 */
export const ENGINE_TYPES: Record<EngineType, EngineMeta> = {
  'openai-compatible': { label: 'OpenAI 兼容接口', keyMode: 'optional', model: 'customModelOnly' },
  deepseek: { label: 'DeepSeek', keyMode: 'required', model: 'optional', fixedEndpoint: true },
  openai: { label: 'OpenAI', keyMode: 'required', model: 'optional', fixedEndpoint: true },
  deepl: { label: 'DeepL API', keyMode: 'required', model: 'none', fixedEndpoint: true },
  deeplx: { label: 'DeepLX（自建）', keyMode: 'none', model: 'none' },
  ollama: { label: 'Ollama（本机）', keyMode: 'none', model: 'optional' },
}

export function isEngineType(provider: string): provider is EngineType {
  return Object.hasOwn(ENGINE_TYPES, provider)
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

/** 与 preload/policy.js 同一规则：https，或 http://localhost、http://127.0.0.1。返回错误文案，合法返回 null。 */
export function validateBaseURL(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return '服务地址不是有效的网址'
  }
  if (url.username || url.password || /[?#]/.test(raw)) return '服务地址不能包含登录凭据、查询参数或片段'
  if (url.protocol === 'https:') return null
  if (url.protocol === 'http:') {
    if (LOOPBACK_HOSTS.has(url.hostname)) return null
    return '暂不支持局域网或其他非本机的 http 地址；请用 https，或本机的 http://localhost、http://127.0.0.1'
  }
  return '服务地址只能是 https，或本机的 http://localhost、http://127.0.0.1'
}

function endpointInputOrNull(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    return new URL(raw.trim()).href.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** 表单里的一份草稿。key 留空 = 不改已保存的 key。 */
export interface EngineDraft {
  name: string
  baseURL: string
  key: string
  model: string
}

export interface DraftContext {
  type: EngineType
  /** 该 provider 现在是否已在 secrets 里存了 key（secrets.has）。新建时为 false。 */
  hasKey: boolean
  /** 已保存配置里的地址；新建时 undefined。 */
  savedBaseURL?: string
  /** 其他 provider 的名字（上游 schema 要求名字唯一）。 */
  otherNames: readonly string[]
}

export type DraftErrors = Partial<Record<keyof EngineDraft, string>>

export function validateEngineDraft(draft: EngineDraft, ctx: DraftContext): DraftErrors {
  const meta = ENGINE_TYPES[ctx.type]
  const errors: DraftErrors = {}
  const name = draft.name.trim()
  if (!name) errors.name = '请填写名称'
  else if (ctx.otherNames.includes(name)) errors.name = '已有同名引擎'

  const key = draft.key.trim()
  if (!meta.fixedEndpoint) {
    const urlError = draft.baseURL.trim() ? validateBaseURL(draft.baseURL) : '请填写服务地址'
    if (urlError) errors.baseURL = urlError
    else if (ctx.type === 'deeplx' && draft.baseURL.includes('{{apiKey}}'))
      errors.baseURL = '不支持把 key 写在地址里；请填写自建 DeepLX 的地址'
  }

  if (meta.keyMode !== 'none') {
    if (/[\u0000-\u001f\u007f]/.test(key)) errors.key = 'key 里不能有换行等控制字符'
    else if (!key && meta.keyMode === 'required' && !ctx.hasKey) errors.key = '请填写 API key'
    else if (!key && ctx.hasKey && !meta.fixedEndpoint) {
      const before = endpointInputOrNull(ctx.savedBaseURL)
      const after = endpointInputOrNull(draft.baseURL)
      if (after && before !== after) errors.key = '服务地址已变更，请重新输入 API key'
    }
  }

  if (meta.model === 'customModelOnly' && !draft.model.trim()) errors.model = '请填写模型名'
  return errors
}

export type EngineServices = { engines: EngineAccessApi }

/** 设置页管理的 provider 行（上游 providersConfig 的一项，只列本页读写的字段）。 */
export interface EngineRow {
  id: string
  name: string
  provider: string
  enabled: boolean
  baseURL?: string
  apiKey?: string
  model?: { model: string; isCustomModel: boolean; customModel: string | null }
  [field: string]: unknown
}

/** 先由 preload 保存端点授权和 key；返回的配置只含占位符。 */
export async function saveEngine(
  services: EngineServices,
  row: EngineRow,
  draft: EngineDraft,
  ctx: DraftContext,
): Promise<EngineRow> {
  const meta = ENGINE_TYPES[ctx.type]
  const key = meta.keyMode === 'none' ? '' : draft.key.trim()
  const { baseURL, hasKey } = await services.engines.save(row.id, ctx.type, draft.baseURL.trim(), key)
  const next: EngineRow = { ...row, name: draft.name.trim(), baseURL, enabled: true }
  delete next.apiKey
  if (hasKey) next.apiKey = services.engines.ref(row.id)

  if (meta.model !== 'none') {
    const model = draft.model.trim()
    if (meta.model === 'customModelOnly') {
      next.model = { model: 'use-custom-model', isCustomModel: true, customModel: model }
    } else if (model && row.model) {
      next.model = { ...row.model, isCustomModel: true, customModel: model }
    } else if (row.model) {
      next.model = { ...row.model, isCustomModel: false, customModel: null }
    }
  }
  return next
}

/** 删除引擎时同时清除本机端点授权和 key。 */
export async function forgetEngine(services: EngineServices, providerId: string): Promise<void> {
  await services.engines.remove(providerId)
}

/**
 * 新 provider 的初始行：以上游 DEFAULT_PROVIDER_CONFIG[type] 为底（模型默认值、reasoning: "none" 等），
 * 去掉上游的示例地址与 key，换上新 id 和不重名的名字。
 */
export function newEngineRow(
  type: EngineType,
  id: string,
  upstreamDefault: object,
  existingNames: readonly string[],
): EngineRow {
  const base = ENGINE_TYPES[type].label
  let name = base
  for (let i = 2; existingNames.includes(name); i++) name = `${base} ${i}`
  const row: EngineRow = { ...structuredClone(upstreamDefault), id, name, provider: type, enabled: true }
  delete row.baseURL
  delete row.apiKey
  delete row.description
  return row
}

/** 已保存行 → 表单初值（key 永远为空，不回显）。 */
export function draftFromRow(row: EngineRow, type: EngineType): EngineDraft {
  const model = row.model
  const customModel = model?.isCustomModel ? (model.customModel ?? '') : ''
  return {
    name: row.name,
    baseURL: ENGINE_TYPES[type].fixedEndpoint ? '' : (row.baseURL ?? ''),
    key: '',
    model: customModel,
  }
}

/*
 * uTools AI 的模型与思考开关存在上游配置 utools-ai 这一行里，走上游原有的请求链路：
 *   model.customModel  → 请求体 model（UTOOLS_AI_DEFAULT_MODEL 由 provider-fetch 删掉 = uTools 默认模型）
 *   providerOptions.reasoningEffort → @ai-sdk/openai-compatible 写成请求体 reasoning_effort → utools-ai-fetch
 * 总是显式写 providerOptions：上游在它缺省时会按模型名套推荐参数，可能带上别的思考设置。
 */
export const THINKING_ON_EFFORT = 'medium'
export const THINKING_OFF_EFFORT = 'none'

export interface UtoolsAiSettings {
  /** undefined = uTools 默认模型 */
  model: string | undefined
  thinking: boolean
}

export function readUtoolsAiSettings(row: EngineRow | undefined): UtoolsAiSettings {
  const custom = row?.model?.customModel
  const effort = (row?.providerOptions as { reasoningEffort?: unknown } | undefined)?.reasoningEffort
  return {
    model: custom && custom !== UTOOLS_AI_DEFAULT_MODEL ? custom : undefined,
    thinking: effort !== undefined && effort !== THINKING_OFF_EFFORT,
  }
}

export function applyUtoolsAiSettings(row: EngineRow, settings: UtoolsAiSettings): EngineRow {
  if (row.id !== UTOOLS_AI_PROVIDER_ID) throw new Error(`not the uTools AI provider: ${row.id}`)
  const options = { ...(row.providerOptions as Record<string, unknown> | undefined) }
  delete options.reasoning_effort
  options.reasoningEffort = settings.thinking ? THINKING_ON_EFFORT : THINKING_OFF_EFFORT
  return {
    ...row,
    model: { model: 'use-custom-model', isCustomModel: true, customModel: settings.model ?? UTOOLS_AI_DEFAULT_MODEL },
    providerOptions: options,
  }
}

/** 引擎列表顺序：uTools AI 固定第一个，其余按配置顺序。 */
export function orderEngines<T extends { id: string }>(rows: readonly T[]): T[] {
  const first = rows.filter((r) => r.id === UTOOLS_AI_PROVIDER_ID)
  return [...first, ...rows.filter((r) => r.id !== UTOOLS_AI_PROVIDER_ID)]
}
