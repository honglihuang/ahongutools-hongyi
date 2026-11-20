// 设置页「术语表与背景说明」分区（第三阶段 G）。
// 术语表存本机 localStore（./repository.ts；uTools 插件页的 IndexedDB 重启后不保留），不随 uTools 账号同步；uTools 里没有网页，不提供网址范围（所有术语表对所有文本生效）。
// 背景说明 = 自定义翻译提示词（prompts-part.tsx）。
import { useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { Button } from '@/components/ui/base-ui/button'
import { Checkbox } from '@/components/ui/base-ui/checkbox'
import { Input } from '@/components/ui/base-ui/input'
import { configFieldsAtomMap, writeConfigAtom } from '@/utils/atoms/config'
import { MAX_GLOSSARIES } from '@/utils/constants/glossary'
import { ConfigItem, errorText, Field, Note } from '../settings/ui.tsx'
import { ConfirmDelete } from './confirm-delete.tsx'
import { GlossaryEditor } from './glossary-editor.tsx'
import { PromptsPart } from './prompts-part.tsx'
import { createGlossary, deleteGlossary, setGlossaryEnabled, updateGlossaryMeta } from './repository.ts'
import { useGlossaries } from './use-glossaries.ts'

/** 新建 / 改名：名称非空且不与其他术语表重名。 */
function nameError(name: string, others: readonly string[]): string | undefined {
  const n = name.trim()
  if (n === '') return '请填写名称'
  if (others.some((o) => o.trim() === n)) return '已有同名的术语表'
  return undefined
}

function NameForm({ initial, others, onSave, onCancel }: {
  initial: string
  others: string[]
  onSave: (name: string) => Promise<string | undefined>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string>()
  const submit = async () => {
    const found = nameError(name, others)
    setError(found ?? (await onSave(name.trim())))
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field label="术语表名称" error={error}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
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

export default function GlossarySettingsSection() {
  const glossaryConfig = useAtomValue(configFieldsAtomMap.glossary)
  const writeConfig = useSetAtom(writeConfigAtom)
  const { glossaries, counts, error: loadError, run } = useGlossaries()
  const [open, setOpen] = useState<string>()
  const [naming, setNaming] = useState<{ id?: string; name: string }>()
  const [error, setError] = useState<string>()
  const names = glossaries?.map((g) => g.name) ?? []

  const act = async (task: () => Promise<unknown>) => setError(await run(task))
  const toggleMaster = async (enabled: boolean) => {
    setError(undefined)
    try {
      await writeConfig({ glossary: { enabled } })
    } catch (e) {
      setError(`保存失败：${errorText(e)}`)
    }
  }
  const saveName = async (name: string): Promise<string | undefined> => {
    const id = naming?.id
    const err = await run(async () => {
      if (id) return updateGlossaryMeta(id, { name })
      const r = await createGlossary(name)
      if (!r.ok) throw new Error(`最多 ${MAX_GLOSSARIES} 个术语表`)
      setOpen(r.id)
    })
    if (!err) setNaming(undefined)
    return err
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <Note>术语表只对 AI 引擎生效，DeepL 等不使用术语表。术语只存在本机，不随 uTools 账号同步；换电脑请用 CSV 导出导入。</Note>
      <ConfigItem title="使用术语表" description="翻译时把原文里出现的术语和指定译法交给 AI。">
        <Checkbox aria-label="使用术语表" checked={glossaryConfig.enabled} onCheckedChange={(on) => void toggleMaster(on)} />
      </ConfigItem>
      {loadError && <p className="text-[13px] text-destructive">{loadError}</p>}
      {glossaries && glossaries.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {glossaries.map((g) => (
            <li key={g.id} className="flex flex-col gap-2 px-3 py-2">
              <div className="flex items-center gap-3">
                <Checkbox aria-label="启用" checked={g.enabled} onCheckedChange={(on) => void act(() => setGlossaryEnabled(g.id, on))} />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col text-left"
                  onClick={() => setOpen(open === g.id ? undefined : g.id)}
                >
                  <span className="truncate text-sm font-medium">{g.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {counts.get(g.id) ?? 0} 条术语{!g.enabled && ' · 未启用'} · {open === g.id ? '点击收起' : '点击展开'}
                  </span>
                </button>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => setNaming({ id: g.id, name: g.name })}>
                    改名
                  </Button>
                  <ConfirmDelete title={`删除术语表「${g.name}」？`} onConfirm={() => void act(() => deleteGlossary(g.id))}>
                    连同其中 {counts.get(g.id) ?? 0} 条术语一起删除，不能恢复。需要备份的话先导出 CSV。
                  </ConfirmDelete>
                </div>
              </div>
              {open === g.id && <GlossaryEditor glossary={g} run={run} />}
            </li>
          ))}
        </ul>
      )}
      {naming ? (
        <NameForm
          key={naming.id ?? 'new'}
          initial={naming.name}
          others={glossaries?.filter((g) => g.id !== naming.id).map((g) => g.name) ?? []}
          onSave={saveName}
          onCancel={() => setNaming(undefined)}
        />
      ) : (
        <div>
          <Button size="sm" disabled={!glossaries} onClick={() => setNaming({ name: names.length === 0 ? '我的术语表' : '' })}>
            新建术语表
          </Button>
        </div>
      )}
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      <h3 className="pt-2 text-sm font-semibold">背景说明（自定义翻译提示词）</h3>
      <PromptsPart />
    </div>
  )
}
