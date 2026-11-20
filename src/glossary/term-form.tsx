// 单条术语的新增 / 编辑表单：原文、译文（空 = 保留原文）、目标语言（所有语言或某一种）、区分大小写、启用。
import type { LangCodeISO6393 } from '@read-frog/definitions'
import type { GlossaryTargetLang } from '@/utils/glossary/target-language'
import { useState } from 'react'
import { LanguageCombobox } from '@/components/language-combobox'
import { getGlossaryTargetLanguageItems } from '@/components/language-combobox-options'
import { Button } from '@/components/ui/base-ui/button'
import { Checkbox } from '@/components/ui/base-ui/checkbox'
import { Input } from '@/components/ui/base-ui/input'
import { MAX_GLOSSARY_TERMS } from '@/utils/constants/glossary'
import { defaultGlossaryTargetLang } from '@/utils/glossary/target-language'
import { getPrefs } from '../entry/prefs.ts'
import { errorText, Field } from '../settings/ui.tsx'
import type { GlossaryTerm, SaveGlossaryTermResult } from './repository.ts'
import { saveGlossaryTerm } from './repository.ts'

export const ALL_LANGUAGES_LABEL = '所有语言'

const SAVE_ERRORS: Record<Extract<SaveGlossaryTermResult, { ok: false }>['reason'], string> = {
  emptySource: '请填写原文',
  tooLong: '原文、译文各不超过 200 字',
  capReached: `所有术语表合计最多 ${MAX_GLOSSARY_TERMS} 条术语`,
  duplicate: '这个术语表里已有同一原文、同一目标语言的术语',
}

interface Props {
  glossaryId: string
  term?: GlossaryTerm
  onDone: () => void
}

export function TermForm({ glossaryId, term, onDone }: Props) {
  const native = getPrefs().direction.native as LangCodeISO6393
  const [source, setSource] = useState(term?.source ?? '')
  const [target, setTarget] = useState(term?.target ?? '')
  const [lang, setLang] = useState<GlossaryTargetLang | undefined>(term?.targetLang)
  const [caseSensitive, setCaseSensitive] = useState(term?.caseSensitive ?? false)
  const [enabled, setEnabled] = useState(term?.enabled ?? true)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  // 没手动选过时按上游规则：译文为空（保留原文）= 所有语言，否则 = 母语。
  const targetLang = lang ?? defaultGlossaryTargetLang(target, native)

  const submit = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const r = await saveGlossaryTerm(glossaryId, { source, target, caseSensitive, targetLang, enabled }, term?.id)
      if (r.ok) onDone()
      else setError(SAVE_ERRORS[r.reason])
    } catch (e) {
      setError(`保存失败：${errorText(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field label="原文">
        <Input value={source} onChange={(e) => setSource(e.target.value)} />
      </Field>
      <Field label="译文" hint="留空 = 保留原文，不翻译">
        <Input value={target} onChange={(e) => setTarget(e.target.value)} />
      </Field>
      <Field label="目标语言" hint="只在译成这种语言时生效">
        <LanguageCombobox
          triggerSize="sm"
          className="max-w-full text-sm"
          items={getGlossaryTargetLanguageItems(ALL_LANGUAGES_LABEL)}
          value={targetLang}
          onValueChange={setLang}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={caseSensitive} onCheckedChange={setCaseSensitive} />
        区分大小写
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={enabled} onCheckedChange={setEnabled} />
        启用
      </label>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => void submit()}>
          保存
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          取消
        </Button>
      </div>
    </div>
  )
}
