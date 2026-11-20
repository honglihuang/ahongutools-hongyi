// 单个引擎的编辑表单：名称、服务地址、API key（只写不读）、模型。保存时 key 经 secrets.set，配置里只存占位符。
import { useState } from 'react'
import { Button } from '@/components/ui/base-ui/button'
import { Input } from '@/components/ui/base-ui/input'
import { PROVIDER_URL_PLACEHOLDERS } from '@/utils/constants/providers'
import type { DraftErrors, EngineDraft, EngineRow, EngineType } from './logic.ts'
import { draftFromRow, ENGINE_TYPES, saveEngine, validateEngineDraft } from './logic.ts'
import { errorText, Field } from './ui.tsx'

const KEY_HINT = { required: '必填', optional: '可不填（本机服务通常不需要）', none: '' } as const

interface Props {
  row: EngineRow
  type: EngineType
  isNew: boolean
  hasKey: boolean
  otherNames: string[]
  onSaved: (row: EngineRow) => Promise<void>
  onCancel: () => void
}

export function EngineForm({ row, type, isNew, hasKey, otherNames, onSaved, onCancel }: Props) {
  const meta = ENGINE_TYPES[type]
  const [draft, setDraft] = useState<EngineDraft>(() => draftFromRow(row, type))
  const [errors, setErrors] = useState<DraftErrors>({})
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const ctx = { type, hasKey, savedBaseURL: isNew ? undefined : row.baseURL, otherNames }
  const set = (field: keyof EngineDraft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }))

  const submit = async () => {
    const found = validateEngineDraft(draft, ctx)
    setErrors(found)
    setSaveError(undefined)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await onSaved(await saveEngine(window.services, row, draft, ctx))
    } catch (error) {
      setSaveError(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field label="名称" error={errors.name}>
        <Input value={draft.name} onChange={set('name')} />
      </Field>
      {!meta.fixedBaseURL && (
        <Field label="服务地址" error={errors.baseURL} hint="https 地址，或本机的 http://localhost、http://127.0.0.1；暂不支持局域网 http 地址">
          <Input value={draft.baseURL} onChange={set('baseURL')} placeholder={PROVIDER_URL_PLACEHOLDERS[type]?.replace('/{{apiKey}}', '')} />
        </Field>
      )}
      {meta.keyMode !== 'none' && (
        <Field
          label={`API key（${hasKey ? '已保存' : '未设置'}）`}
          error={errors.key}
          hint={meta.fixedBaseURL ? '免费版 key 以 :fx 结尾，会自动使用免费版地址' : KEY_HINT[meta.keyMode]}
        >
          <Input
            type="password"
            autoComplete="off"
            value={draft.key}
            onChange={set('key')}
            placeholder={hasKey ? '已保存，留空则不修改' : '粘贴 API key'}
          />
        </Field>
      )}
      {meta.model !== 'none' && (
        <Field label="模型" error={errors.model} hint={meta.model === 'optional' ? '留空使用默认模型' : undefined}>
          <Input value={draft.model} onChange={set('model')} placeholder={meta.model === 'optional' ? row.model?.model : '如 gpt-4o-mini'} />
        </Field>
      )}
      {saveError && <p className="text-[13px] text-destructive">保存失败：{saveError}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={saving} onClick={() => void submit()}>
          保存
        </Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}
