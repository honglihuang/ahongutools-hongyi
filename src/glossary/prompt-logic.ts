// 设置页「自定义翻译提示词」的纯逻辑（不 import 上游运行时代码，node --test 直接跑）。
import type { Config } from '@/types/config/config'

type CustomPrompts = Config['pageTranslation']['customPromptsConfig']
export type PromptPattern = CustomPrompts['patterns'][number]

export interface PromptDraft {
  name: string
  systemPrompt: string
  prompt: string
}

export type PromptDraftErrors = Partial<Record<'name' | 'prompt', string>>

const INPUT_TOKEN = '{{input}}'

/** 名称非空且不与其他提示词（含内置）重名；提示词或系统提示词里必须有 {{input}}（原文放进去的位置）。 */
export function validatePromptDraft(draft: PromptDraft, otherNames: readonly string[]): PromptDraftErrors {
  const errors: PromptDraftErrors = {}
  const name = draft.name.trim()
  if (name === '') errors.name = '请填写名称'
  else if (otherNames.some((n) => n.trim() === name)) errors.name = '已有同名的提示词'
  if (!draft.prompt.includes(INPUT_TOKEN) && !draft.systemPrompt.includes(INPUT_TOKEN)) {
    errors.prompt = `提示词或系统提示词里要有 ${INPUT_TOKEN}（翻译时换成原文）`
  }
  return errors
}

/** 新增或替换一条自定义提示词。 */
export function putPromptPatch(current: Config, pattern: PromptPattern): Partial<Config> {
  const cpc = current.pageTranslation.customPromptsConfig
  const exists = cpc.patterns.some((p) => p.id === pattern.id)
  const patterns = exists ? cpc.patterns.map((p) => (p.id === pattern.id ? pattern : p)) : [...cpc.patterns, pattern]
  return { pageTranslation: { ...current.pageTranslation, customPromptsConfig: { ...cpc, patterns } } }
}

/**
 * 删除一条自定义提示词。customPromptsConfig.promptId 指向它时必须同一次写入改回默认：
 * 否则 configSchema 校验失败，上游整份配置回落到 DEFAULT_CONFIG（引擎全丢）。translationHub.promptId 同样改回默认。
 */
export function deletePromptPatch(current: Config, id: string, defaultId: string): Partial<Config> {
  const cpc = current.pageTranslation.customPromptsConfig
  const patch: Partial<Config> = {
    pageTranslation: {
      ...current.pageTranslation,
      customPromptsConfig: {
        promptId: cpc.promptId === id ? defaultId : cpc.promptId,
        patterns: cpc.patterns.filter((p) => p.id !== id),
      },
    },
  }
  if (current.translationHub.promptId === id) patch.translationHub = { ...current.translationHub, promptId: defaultId }
  return patch
}
