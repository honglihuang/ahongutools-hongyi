// 设置页的纯逻辑（不依赖 React 与上游 `@/` 模块，可直接 node --test）。
// key 只经 window.services.secrets 存本机（决策 E5），配置里只写占位符；无 key 的 provider 用 net.allowOrigin 登记。
import type { NetAllowApi, SecretsApi } from '../bridge/contract.ts'
import { UTOOLS_AI_DEFAULT_MODEL, UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'

export type KeyMode = 'required' | 'optional' | 'none'

export interface EngineMeta {
  label: string
  /** required：必须有 key；optional：可不填（如本机 LM Studio），不填就按无 key 登记 origin；none：不收 key。 */
  keyMode: KeyMode
  /** 是否有模型字段；customModelOnly = 必须填模型名（上游 openai-compatible 只接受自定义模型）。 */
  model: 'none' | 'optional' | 'customModelOnly'
  /** 地址由 key 决定，不让用户填（DeepL）。 */
  fixedBaseURL?: (key: string) => string
}

export type EngineType = 'openai-compatible' | 'deepseek' | 'openai' | 'deepl' | 'deeplx' | 'ollama'

/** 设置页可添加的引擎（决策 E3）。键是上游 provider 类型。 */
export const ENGINE_TYPES: Record<EngineType, EngineMeta> = {
  'openai-compatible': { label: 'OpenAI 兼容接口', keyMode: 'optional', model: 'customModelOnly' },
  deepseek: { label: 'DeepSeek', keyMode: 'required', model: 'optional' },
  openai: { label: 'OpenAI', keyMode: 'required', model: 'optional' },
  deepl: { label: 'DeepL API', keyMode: 'required', model: 'none', fixedBaseURL: deeplBaseURL },
  deeplx: { label: 'DeepLX（自建）', keyMode: 'none', model: 'none' },
  ollama: { label: 'Ollama（本机）', keyMode: 'none', model: 'optional' },
}

export function isEngineType(provider: string): provider is EngineType {
  return Object.hasOwn(ENGINE_TYPES, provider)
}

/** 与上游 utils/host/translate/api/deepl.ts 的 getDeepLBaseURL 同一规则：免费版 key 以 ":fx" 结尾。 */
export function deeplBaseURL(key: string): string {
  return key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
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
  if (url.protocol === 'https:') return null
  if (url.protocol === 'http:') {
    if (LOOPBACK_HOSTS.has(url.hostname)) return null
    return '暂不支持局域网或其他非本机的 http 地址；请用 https，或本机的 http://localhost、http://127.0.0.1'
  }
  return '服务地址只能是 https，或本机的 http://localhost、http://127.0.0.1'
}

function originOrNull(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    return new URL(raw.trim()).origin
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

/** 草稿最终要用的地址：DeepL 由 key 决定，key 留空时沿用已保存的地址。 */
export function effectiveBaseURL(draft: EngineDraft, ctx: DraftContext): string {
  const meta = ENGINE_TYPES[ctx.type]
  if (meta.fixedBaseURL) {
    const key = draft.key.trim()
    return key ? meta.fixedBaseURL(key) : (ctx.savedBaseURL ?? '')
  }
  return draft.baseURL.trim()
}

export function validateEngineDraft(draft: EngineDraft, ctx: DraftContext): DraftErrors {
  const meta = ENGINE_TYPES[ctx.type]
  const errors: DraftErrors = {}
  const name = draft.name.trim()
  if (!name) errors.name = '请填写名称'
  else if (ctx.otherNames.includes(name)) errors.name = '已有同名引擎'

  const key = draft.key.trim()
  if (!meta.fixedBaseURL) {
    const urlError = draft.baseURL.trim() ? validateBaseURL(draft.baseURL) : '请填写服务地址'
    if (urlError) errors.baseURL = urlError
    else if (ctx.type === 'deeplx' && draft.baseURL.includes('{{apiKey}}'))
      errors.baseURL = '不支持把 key 写在地址里；请填写自建 DeepLX 的地址'
  }

  if (meta.keyMode !== 'none') {
    if (/[\u0000-\u001f\u007f]/.test(key)) errors.key = 'key 里不能有换行等控制字符'
    else if (!key && meta.keyMode === 'required' && !ctx.hasKey) errors.key = '请填写 API key'
    else if (!key && ctx.hasKey && !meta.fixedBaseURL) {
      const before = originOrNull(ctx.savedBaseURL)
      const after = originOrNull(draft.baseURL)
      // 已保存的 key 只允许发往保存时登记的 origin；换了地址必须重新输入，渲染层拿不到旧 key。
      if (after && before !== after) errors.key = '服务地址换了域名，请重新输入 API key'
    }
  }

  if (meta.model === 'customModelOnly' && !draft.model.trim()) errors.model = '请填写模型名'
  return errors
}

export type EngineServices = { secrets: SecretsApi; net: NetAllowApi }

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

/**
 * 保存草稿：先把 key 存进 secrets（或给无 key 的 provider 登记 origin），再返回要写进上游配置的行。
 * 返回的行里 apiKey 只会是 secrets.ref 占位符或不存在。调用方必须先 validateEngineDraft 通过。
 */
export async function saveEngine(
  services: EngineServices,
  row: EngineRow,
  draft: EngineDraft,
  ctx: DraftContext,
): Promise<EngineRow> {
  const meta = ENGINE_TYPES[ctx.type]
  const baseURL = effectiveBaseURL(draft, ctx)
  const key = draft.key.trim()
  const next: EngineRow = { ...row, name: draft.name.trim(), enabled: true }
  if (baseURL) next.baseURL = baseURL
  delete next.apiKey

  if (meta.keyMode !== 'none' && key) {
    await services.secrets.set(row.id, key, baseURL)
    await services.net.revoke(row.id)
    next.apiKey = services.secrets.ref(row.id)
  } else if (meta.keyMode !== 'none' && ctx.hasKey) {
    next.apiKey = services.secrets.ref(row.id)
  } else {
    await services.net.allowOrigin(row.id, baseURL)
  }

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

/** 删除 provider 后清掉它在 preload 里的 key 和 origin 登记（两者都幂等，不管原来有没有）。 */
export async function forgetEngine(services: EngineServices, providerId: string): Promise<void> {
  await services.secrets.remove(providerId)
  await services.net.revoke(providerId)
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
    baseURL: ENGINE_TYPES[type].fixedBaseURL ? '' : (row.baseURL ?? ''),
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
