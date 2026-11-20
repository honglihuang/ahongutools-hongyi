// 「背景说明」= 自定义翻译提示词：把背景写进系统提示词。当前提示词与主界面下拉同一个选择（写 translationHub.promptId）。
import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { getBuiltInPageTranslatePrompts } from '@/components/prompt-configurator/built-in-prompts'
import { Button } from '@/components/ui/base-ui/button'
import { Input } from '@/components/ui/base-ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/base-ui/select'
import { Textarea } from '@/components/ui/base-ui/textarea'
import { configAtom, writeConfigAtom } from '@/utils/atoms/config'
import { DEFAULT_TRANSLATE_PROMPT, DEFAULT_TRANSLATE_PROMPT_ID, DEFAULT_TRANSLATE_SYSTEM_PROMPT } from '@/utils/constants/prompt'
import { getRandomUUID } from '@/utils/crypto-polyfill'
import { activePromptConfig } from '../entry/translate-core.ts'
import { promptCatalog } from '../entry/translate.ts'
import { ConfigItem, errorText, Field, Note } from '../settings/ui.tsx'
import { ConfirmDelete } from './confirm-delete.tsx'
import type { PromptDraft, PromptDraftErrors, PromptPattern } from './prompt-logic.ts'
import { deletePromptPatch, putPromptPatch, validatePromptDraft } from './prompt-logic.ts'

const BACKGROUND_HINT =
  '背景说明写进系统提示词，例如「以下内容来自医疗器械说明书，读者是临床医生」。{{targetLanguage}} 换成目标语言，{{input}} 换成原文，提示词或系统提示词里必须有 {{input}}。只对 AI 引擎生效。'

function PromptForm({ pattern, otherNames, onSave, onCancel }: {
  pattern: PromptPattern
  otherNames: string[]
  onSave: (p: PromptPattern) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<PromptDraft>({ name: pattern.name, systemPrompt: pattern.systemPrompt, prompt: pattern.prompt })
  const [errors, setErrors] = useState<PromptDraftErrors>({})
  const [saveError, setSaveError] = useState<string>()
  const set = (field: keyof PromptDraft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [field]: e.target.value }))

  const submit = async () => {
    const found = validatePromptDraft(draft, otherNames)
    setErrors(found)
    setSaveError(undefined)
    if (Object.keys(found).length > 0) return
    try {
      await onSave({ ...pattern, ...draft, name: draft.name.trim() })
    } catch (e) {
      setSaveError(`保存失败：${errorText(e)}`)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field label="名称" error={errors.name}>
        <Input value={draft.name} onChange={set('name')} />
      </Field>
      <Field label="系统提示词" hint={BACKGROUND_HINT}>
        <Textarea className="text-sm" style={{ minHeight: '10rem' }} value={draft.systemPrompt} onChange={set('systemPrompt')} />
      </Field>
      <Field label="提示词" error={errors.prompt}>
        <Textarea className="text-sm" style={{ minHeight: '5rem' }} value={draft.prompt} onChange={set('prompt')} />
      </Field>
      {saveError && <p className="text-[13px] text-destructive">{saveError}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void submit()}>
          保存
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}

export function PromptsPart() {
  const config = useAtomValue(configAtom)
  const writeConfig = useSetAtom(writeConfigAtom)
  const [editing, setEditing] = useState<PromptPattern>()
  const [error, setError] = useState<string>()
  const patterns = config.pageTranslation.customPromptsConfig.patterns
  const builtIns = getBuiltInPageTranslatePrompts()
  const { promptId } = activePromptConfig(config, promptCatalog)
  const items = [...builtIns.map((p) => ({ value: p.id, label: p.name })), ...patterns.map((p) => ({ value: p.id, label: p.name }))]
  const labelOf = (id: string) => items.find((i) => i.value === id)?.label ?? id

  const write = async (update: Parameters<typeof writeConfig>[0]) => {
    setError(undefined)
    try {
      await writeConfig(update)
    } catch (e) {
      setError(`保存失败：${errorText(e)}`)
      throw e
    }
  }

  const startAdd = () =>
    setEditing({ id: getRandomUUID(), name: '', systemPrompt: DEFAULT_TRANSLATE_SYSTEM_PROMPT, prompt: DEFAULT_TRANSLATE_PROMPT })

  return (
    <div className="flex w-full flex-col gap-3">
      <ConfigItem
        title="当前提示词"
        orientation="vertical"
        description="「翻译」主界面、翻译并粘回、文件翻译、截图的「重新翻译」都用这一个；主界面的提示词下拉改的也是它。只对 AI 引擎生效。"
      >
        <Select value={promptId} onValueChange={(v) => void write((c) => ({ translationHub: { ...c.translationHub, promptId: v as string } })).catch(() => {})}>
          <SelectTrigger size="sm" className="max-w-full">
            <SelectValue render={<span />}>{labelOf(promptId)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ConfigItem>
      {patterns.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {patterns.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate text-sm font-medium">
                {p.name}
                {p.id === promptId && <span className="ml-2 text-xs text-muted-foreground">当前</span>}
              </span>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                  编辑
                </Button>
                <ConfirmDelete
                  title={`删除提示词「${p.name}」？`}
                  onConfirm={() => void write((c) => deletePromptPatch(c, p.id, DEFAULT_TRANSLATE_PROMPT_ID)).catch(() => {})}
                >
                  正在用它的话改回默认提示词。
                </ConfirmDelete>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <PromptForm
          key={editing.id}
          pattern={editing}
          otherNames={items.filter((i) => i.value !== editing.id).map((i) => i.label)}
          onSave={async (p) => {
            await write((c) => putPromptPatch(c, p))
            setEditing(undefined)
          }}
          onCancel={() => setEditing(undefined)}
        />
      ) : (
        <div>
          <Button size="sm" onClick={startAdd}>
            添加提示词
          </Button>
        </div>
      )}
      <Note>新提示词以默认提示词为底稿；在系统提示词里加上背景说明即可。</Note>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  )
}
