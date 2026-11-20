// 生词的新增 / 编辑表单：原文、释义、原文语言（可选「未知」）、释义语言。加入时已有同一生词的话先说明，保存即更新释义。
import { useEffect, useMemo, useState } from 'react'
import { LanguageCombobox } from '@/components/language-combobox'
import { getTargetLanguageItems } from '@/components/language-combobox-options'
import { Button } from '@/components/ui/base-ui/button'
import { Input } from '@/components/ui/base-ui/input'
import { Textarea } from '@/components/ui/base-ui/textarea'
import { errorText, Field } from '../settings/ui.tsx'
import type { VocabEntry } from './contract.ts'
import { VOCAB_MAX_CHARS, VOCAB_MAX_WORDS } from './contract.ts'
import type { SaveVocabResult, VocabFields } from './repository.ts'
import { addVocab, findDuplicate, updateVocab } from './repository.ts'

export const UNKNOWN_LANG = 'und'
export const UNKNOWN_LANG_LABEL = '未知'

const SAVE_ERRORS: Record<Extract<SaveVocabResult, { ok: false }>['reason'], string> = {
  empty: '请填写原文',
  tooLong: `原文太长：生词本只收不超过 ${VOCAB_MAX_WORDS} 个词或 ${VOCAB_MAX_CHARS} 个字符的词语`,
  duplicate: '生词本里已有同一原文、同一释义语言的生词',
  notFound: '这条生词已被删除',
}

export type VocabFormMode = { kind: 'add'; from: VocabEntry['from'] } | { kind: 'edit'; id: string }

interface Props {
  initial: VocabFields
  mode: VocabFormMode
  /** 保存成功：message 是「已加入生词本」或「已更新」。 */
  onSaved: (message: string) => void
  onCancel: () => void
}

export function VocabForm({ initial, mode, onSaved, onCancel }: Props) {
  const [fields, setFields] = useState(initial)
  const [duplicate, setDuplicate] = useState<VocabEntry>()
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<VocabFields>) => setFields((f) => ({ ...f, ...patch }))
  const targetItems = useMemo(() => getTargetLanguageItems(), [])
  const sourceItems = useMemo(() => [{ value: UNKNOWN_LANG, label: UNKNOWN_LANG_LABEL }, ...targetItems], [targetItems])

  // 加入时：同一原文、同一释义语言已有生词，就提示保存会更新它的释义。
  useEffect(() => {
    if (mode.kind !== 'add') return
    let live = true
    findDuplicate({ term: fields.term, targetLang: fields.targetLang }).then(
      (d) => live && setDuplicate(d),
      (e: unknown) => live && setError(`读取生词本失败：${errorText(e)}`),
    )
    return () => void (live = false)
  }, [mode.kind, fields.term, fields.targetLang])

  const submit = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const r = mode.kind === 'add' ? await addVocab({ ...fields, from: mode.from }) : await updateVocab(mode.id, fields)
      if (!r.ok) setError(SAVE_ERRORS[r.reason])
      else onSaved(mode.kind === 'add' && !r.updated ? '已加入生词本' : '已更新')
    } catch (e) {
      setError(`保存失败：${errorText(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ overflowWrap: 'anywhere' }}>
      <Field label="原文">
        <Input value={fields.term} onChange={(e) => set({ term: e.target.value })} />
      </Field>
      <Field label="释义">
        <Textarea value={fields.meaning} onChange={(e) => set({ meaning: e.target.value })} />
      </Field>
      <Field label="原文语言">
        <LanguageCombobox
          triggerSize="sm"
          className="max-w-full text-sm"
          items={sourceItems}
          value={fields.sourceLang}
          onValueChange={(sourceLang) => set({ sourceLang })}
        />
      </Field>
      <Field label="释义语言">
        <LanguageCombobox
          triggerSize="sm"
          className="max-w-full text-sm"
          items={targetItems}
          value={fields.targetLang as (typeof targetItems)[number]['value']}
          onValueChange={(targetLang) => set({ targetLang })}
        />
      </Field>
      {duplicate && (
        <p className="text-[13px] text-muted-foreground">
          生词本里已有「{duplicate.term}」（释义：{duplicate.meaning || '空'}），保存会把释义更新为上面这条。
        </p>
      )}
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => void submit()}>
          {duplicate ? '更新释义' : '保存'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}
