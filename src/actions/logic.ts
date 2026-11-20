// AI 动作的纯逻辑（不 import 上游 `@/` 模块，node --test 直接测）：默认动作、新建与校验、引擎选择、
// 动态指令对账的差异计算、首次写入默认动作的规则、动作视图的按键。上游接线在 store.ts、run.ts。
import type { SelectionToolbarCustomAction } from '@/types/config/selection-toolbar'
import { type EngineCandidate, resolveDefaultEngine } from '../entry/default-engine.ts'
import { ACTION_FEATURE_PREFIX } from '../entry/contract.ts'
import type { KeyLike } from '../entry/hub-keys.ts'
import { UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'

export type CustomAction = SelectionToolbarCustomAction

/** 编辑器里能改的三项。 */
export interface ActionDraft {
  name: string
  systemPrompt: string
  prompt: string
}

/** 唯一的输出字段名：结果只有一段纯文本。 */
export const RESULT_FIELD_NAME = '结果'

export const SELECTION_TOKEN = '{{selection}}'
export const TARGET_LANGUAGE_TOKEN = '{{targetLanguage}}'

export const DEFAULT_ACTIONS: readonly ActionDraft[] = [
  {
    name: '润色',
    systemPrompt: '你是一名细致的文字编辑。',
    prompt:
      '润色下面的文字：修正错别字、语病和标点，让表达更通顺自然。保持原文的语言、意思和语气，不要翻译，不要增删信息。只输出润色后的文字，不要解释，不要加引号或标题。\n\n{{selection}}',
  },
  {
    name: '解释',
    systemPrompt: '你是一名耐心的讲解者，用{{targetLanguage}}回答。',
    prompt:
      '用{{targetLanguage}}解释下面这段文字的意思：先用一两句话概括，再说明其中难懂的词语、术语或背景。用纯文本回答，不要用 Markdown。\n\n{{selection}}',
  },
  {
    name: '词典',
    systemPrompt: '你是一本简明的词典，用{{targetLanguage}}回答。',
    prompt:
      '把下面的词或短语当作词条，用{{targetLanguage}}给出：读音（如有）、词性、常用释义（最多 3 条）、1 到 2 个例句及其翻译。用纯文本分行列出，不要用 Markdown。\n\n{{selection}}',
  },
]

/**
 * 新建一条上游 customActions 记录。providerId 只是为了通过上游 schema（要求是启用的大模型引擎 id）：
 * 运行时不看它，所有动作都用默认引擎（planActionEngine）。layout、sampleData、notebaseConnection、shortcut、enabled 都不填。
 */
export function makeAction(draft: ActionDraft, uuid: () => string): CustomAction {
  return {
    id: uuid(),
    name: draft.name.trim(),
    icon: '',
    providerId: UTOOLS_AI_PROVIDER_ID,
    systemPrompt: draft.systemPrompt,
    prompt: draft.prompt,
    outputSchema: [{ id: uuid(), name: RESULT_FIELD_NAME, type: 'string', description: '' }],
  }
}

/** 按名称找出现有列表里缺的默认动作（「恢复默认动作」只补缺的，名称不会重复）。 */
export function missingDefaults(existing: readonly { name: string }[]): ActionDraft[] {
  const names = new Set(existing.map((a) => a.name))
  return DEFAULT_ACTIONS.filter((d) => !names.has(d.name))
}

export type DraftErrors = Partial<Record<'name' | 'prompt', string>>

/** otherNames：除正在编辑的这条以外的动作名（上游 schema 拒绝重名，重名会让整份配置校验失败）。 */
export function validateActionDraft(draft: ActionDraft, otherNames: readonly string[]): DraftErrors {
  const errors: DraftErrors = {}
  const name = draft.name.trim()
  if (name === '') errors.name = '请填写名称'
  else if (otherNames.includes(name)) errors.name = '已有同名动作'
  if (!draft.prompt.includes(SELECTION_TOKEN) && !draft.systemPrompt.includes(SELECTION_TOKEN)) {
    errors.prompt = `提示词或系统提示词里要有 ${SELECTION_TOKEN}，否则模型收不到要处理的文字`
  }
  return errors
}

export type ActionEnginePlan<T> =
  | { kind: 'provider'; provider: T }
  /** reason：没用默认引擎的原因；默认引擎就是 uTools AI 时没有。 */
  | { kind: 'utools-ai'; reason?: string }

/** 动作用默认引擎（与其他入口同一条规则）；它不是大模型（如 DeepL）或没有可用引擎时改用 uTools AI。 */
export function planActionEngine<T extends EngineCandidate & { name: string }>(
  providers: readonly T[],
  choice: string | null,
  isLLM: (p: T) => boolean,
): ActionEnginePlan<T> {
  const engine = resolveDefaultEngine(providers, choice)
  if (!engine) return { kind: 'utools-ai', reason: '没有可用的默认引擎，改用 uTools AI' }
  if (engine.id === UTOOLS_AI_PROVIDER_ID) return { kind: 'utools-ai' }
  if (!isLLM(engine)) return { kind: 'utools-ai', reason: `默认引擎「${engine.name}」不是大模型，AI 动作改用 uTools AI` }
  return { kind: 'provider', provider: engine }
}

/** 与 public/plugin.json 里「翻译」的 over 指令相同：纯数字和算式不匹配。 */
export const OVER_EXCLUDE = '/^[\\d\\s.,:;+\\-*\\/=%()]+$/'

/**
 * utools.setFeature 的参数类型（utools-api-types 把 Feature 声明在全局），另加 explain：
 * 文档和 utools-api-types 叫 description，但 uTools 7.8.0 运行时的 saveFeature 只认 explain，
 * 缺了会报「feature explain empty」，所以两个字段都传同一段文字。
 */
export type ActionFeature = Parameters<typeof utools.setFeature>[0] & { explain: string }

export const featureCode = (id: string) => ACTION_FEATURE_PREFIX + id

/** 动态 code → 动作 id；不是动作前缀返回 undefined。 */
export const actionIdOfCode = (code: string): string | undefined =>
  code.startsWith(ACTION_FEATURE_PREFIX) ? code.slice(ACTION_FEATURE_PREFIX.length) : undefined

export function actionFeature(action: { id: string; name: string }): ActionFeature {
  const text = `洪译 AI 动作：${action.name}`
  return {
    code: featureCode(action.id),
    explain: text,
    description: text,
    icon: 'logo.png',
    cmds: [{ type: 'over', label: action.name, exclude: OVER_EXCLUDE, minLength: 1, maxLength: 10000 }],
  }
}

/** 应有的指令：本机开启过、且仍存在的动作（保持动作列表顺序）。 */
export function expectedCommandActions<A extends { id: string }>(actions: readonly A[], enabledIds: readonly string[]): A[] {
  const enabled = new Set(enabledIds)
  return actions.filter((a) => enabled.has(a.id))
}

/**
 * 对账：每个应有的指令都 setFeature（顺带更新改过的名称），实际已注册、带本插件动作前缀、却不该有的 removeFeature。
 * 不带前缀的 code 一律不碰。
 */
export function diffFeatures(
  expected: readonly { id: string; name: string }[],
  actualCodes: readonly string[],
): { set: ActionFeature[]; remove: string[] } {
  const set = expected.map(actionFeature)
  const keep = new Set(set.map((f) => f.code))
  const remove = actualCodes.filter((code) => code.startsWith(ACTION_FEATURE_PREFIX) && !keep.has(code))
  return { set, remove: [...new Set(remove)] }
}

export interface SeedDeps {
  /** 存储里的配置能通过校验时返回其中的 customActions；没有配置或校验失败（上游会退回 DEFAULT_CONFIG）返回 null。 */
  readActions(): Promise<readonly CustomAction[] | null>
  writeActions(actions: CustomAction[]): Promise<void>
  getFlag(): boolean
  setFlag(): void
  uuid(): string
}

export type SeedResult = 'seeded' | 'already-has-actions' | 'flag-set' | 'no-valid-config'

/**
 * 只写一次默认动作：标记已设 → 不写；配置读不出或校验失败 → 什么都不写（写回默认配置会冲掉用户的引擎），也不设标记；
 * 列表为空 → 写入默认动作并设标记；已有动作（如别的设备同步来的）→ 只设标记。
 */
export async function seedDefaultActions(deps: SeedDeps): Promise<SeedResult> {
  if (deps.getFlag()) return 'flag-set'
  const current = await deps.readActions()
  if (current === null) return 'no-valid-config'
  if (current.length > 0) {
    deps.setFlag()
    return 'already-has-actions'
  }
  await deps.writeActions(DEFAULT_ACTIONS.map((d) => makeAction(d, deps.uuid)))
  deps.setFlag()
  return 'seeded'
}

export type ViewKey =
  | { type: 'exit' | 'prev' | 'next' | 'run' | 'confirm' | 'copy' | 'paste' }
  | { type: 'select'; index: number }

export type ViewPhase = 'pick' | 'confirm' | 'running' | 'done' | 'other'

/**
 * 动作视图的按键（纯函数）。inField：焦点在页面里的按钮或输入框，这时只认 Esc，其余交给该元素（避免回车既点按钮又触发快捷键）。
 * digits：列表里能否用 1–9 选动作（关键字进入时文字在 uTools 子输入框里打，数字是正文，不能拿来选）。
 */
export function viewKeyAction(e: KeyLike, phase: ViewPhase, opts: { inField: boolean; digits: boolean }): ViewKey | null {
  if (e.isComposing) return null
  if (e.key === 'Escape') return { type: 'exit' }
  if (opts.inField || e.altKey || e.shiftKey) return null
  const mod = e.ctrlKey || e.metaKey
  if (phase === 'pick') {
    if (mod) return null
    if (e.key === 'ArrowUp') return { type: 'prev' }
    if (e.key === 'ArrowDown') return { type: 'next' }
    if (e.key === 'Enter') return { type: 'run' }
    if (opts.digits && /^[1-9]$/.test(e.key)) return { type: 'select', index: Number(e.key) - 1 }
    return null
  }
  if (phase === 'confirm') return e.key === 'Enter' && !mod ? { type: 'confirm' } : null
  if (phase === 'done' && e.key === 'Enter') return { type: mod ? 'paste' : 'copy' }
  return null
}
