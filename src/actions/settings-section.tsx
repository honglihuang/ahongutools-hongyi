// 设置页「AI 动作」分区：动作列表、添加 / 编辑 / 删除、每个动作的「在 uTools 搜索框里用（本机）」开关、恢复默认动作。
// 动作写进上游配置 selectionToolbar.customActions，经 writeConfigAtom（同一条 configSchema 校验）；指令开关存本机 localStore。
// 每次改动后对账 uTools 动态指令，失败显示在分区底部。
import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/base-ui/alert-dialog'
import { Button } from '@/components/ui/base-ui/button'
// 上游 Switch 依赖未安装的 motion 包，用 Checkbox 代替（与 settings/ 其他分区相同）。
import { Checkbox } from '@/components/ui/base-ui/checkbox'
import { Input } from '@/components/ui/base-ui/input'
import { Textarea } from '@/components/ui/base-ui/textarea'
import { configFieldsAtomMap, writeConfigAtom } from '@/utils/atoms/config'
import { getRandomUUID } from '@/utils/crypto-polyfill'
import { errorText, Field, Note } from '../settings/ui.tsx'
import type { ActionDraft, CustomAction, DraftErrors } from './logic.ts'
import { makeAction, missingDefaults, SELECTION_TOKEN, TARGET_LANGUAGE_TOKEN, validateActionDraft } from './logic.ts'
import { getCommandIds, getReconcileErrors, reconcileCommands, setCommandEnabled, subscribeReconcile } from './store.ts'

function useActions() {
  const actions = useAtomValue(configFieldsAtomMap.selectionToolbar).customActions
  const writeConfig = useSetAtom(writeConfigAtom)
  const save = useCallback(
    async (update: (list: CustomAction[]) => CustomAction[]) => {
      await writeConfig((current) => ({
        selectionToolbar: { ...current.selectionToolbar, customActions: update(current.selectionToolbar.customActions) },
      }))
      await reconcileCommands()
    },
    [writeConfig],
  )
  return { actions, save }
}

export default function ActionsSettingsSection() {
  const { actions, save } = useActions()
  const [editing, setEditing] = useState<{ action?: CustomAction }>()
  const [commandIds, setCommandIds] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const reconcileErrors = useSyncExternalStore(subscribeReconcile, getReconcileErrors)

  useEffect(() => {
    getCommandIds().then(setCommandIds, (e: unknown) => setError(`读取指令开关失败：${errorText(e)}`))
  }, [])

  const run = async (task: () => Promise<void>) => {
    setError(undefined)
    setNotice(undefined)
    try {
      await task()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const toggleCommand = (id: string, on: boolean) =>
    run(async () => {
      await setCommandEnabled(id, on)
      setCommandIds(await getCommandIds())
      await reconcileCommands()
    })

  const remove = (id: string) =>
    run(async () => {
      await save((list) => list.filter((a) => a.id !== id))
      await setCommandEnabled(id, false)
      setCommandIds(await getCommandIds())
      if (editing?.action?.id === id) setEditing(undefined)
    })

  const restoreDefaults = () =>
    run(async () => {
      const missing = missingDefaults(actions)
      if (missing.length === 0) {
        setNotice('默认动作都在，没有要恢复的')
        return
      }
      await save((list) => [...list, ...missingDefaults(list).map((d) => makeAction(d, getRandomUUID))])
    })

  return (
    <div className="flex w-full flex-col gap-3">
      <Note>
        对选中或输入的文字运行一段提示词，结果是纯文本，可复制或粘回。用「AI 动作」指令打开；勾选「在 uTools 搜索框里用（本机）」后，选中文字时 uTools 搜索框里会直接出现这个动作。所有动作都用默认引擎；默认引擎不是大模型时改用 uTools AI。
      </Note>
      {actions.length === 0 ? (
        <Note>还没有动作。</Note>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {actions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 truncate text-sm font-medium">{a.name}</span>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox checked={commandIds.includes(a.id)} onCheckedChange={(on) => void toggleCommand(a.id, on)} />
                  在 uTools 搜索框里用（本机）
                </label>
                <Button size="sm" variant="outline" onClick={() => setEditing({ action: a })}>
                  编辑
                </Button>
                <DeleteButton name={a.name} onConfirm={() => void remove(a.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <ActionForm
          key={editing.action?.id ?? 'new'}
          action={editing.action}
          otherNames={actions.filter((a) => a.id !== editing.action?.id).map((a) => a.name)}
          onSave={async (draft) => {
            const target = editing.action
            await save((list) =>
              target
                ? list.map((a) => (a.id === target.id ? { ...a, name: draft.name.trim(), systemPrompt: draft.systemPrompt, prompt: draft.prompt } : a))
                : [...list, makeAction(draft, getRandomUUID)],
            )
            setEditing(undefined)
          }}
          onCancel={() => setEditing(undefined)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setEditing({})}>
            添加动作
          </Button>
          <Button size="sm" variant="outline" onClick={() => void restoreDefaults()}>
            恢复默认动作
          </Button>
        </div>
      )}
      {notice && <Note>{notice}</Note>}
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      {reconcileErrors.map((e) => (
        <p key={e} className="text-[13px] text-destructive">
          {e}
        </p>
      ))}
    </div>
  )
}

function ActionForm({
  action,
  otherNames,
  onSave,
  onCancel,
}: {
  action?: CustomAction
  otherNames: string[]
  onSave: (draft: ActionDraft) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ActionDraft>(() => ({
    name: action?.name ?? '',
    systemPrompt: action?.systemPrompt ?? '',
    prompt: action?.prompt ?? SELECTION_TOKEN,
  }))
  const [errors, setErrors] = useState<DraftErrors>({})
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const set = (field: keyof ActionDraft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [field]: e.target.value }))

  const submit = async () => {
    const found = validateActionDraft(draft, otherNames)
    setErrors(found)
    setSaveError(undefined)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await onSave(draft)
    } catch (e) {
      setSaveError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <Field label="名称" error={errors.name} hint="也是 uTools 搜索框里显示的指令名">
        <Input value={draft.name} onChange={set('name')} placeholder="如 润色" />
      </Field>
      <Field label="系统提示词" hint="可不填">
        <Textarea value={draft.systemPrompt} onChange={set('systemPrompt')} className="max-h-40" />
      </Field>
      <Field
        label="提示词"
        error={errors.prompt}
        hint={`${SELECTION_TOKEN} 换成要处理的文字；${TARGET_LANGUAGE_TOKEN} 换成你的母语（洪译设置「语言方向」里的）。`}
      >
        <Textarea value={draft.prompt} onChange={set('prompt')} className="max-h-60" />
      </Field>
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

function DeleteButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive" />}>删除</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除「{name}」？</AlertDialogTitle>
          <AlertDialogDescription>动作随配置同步，其他设备上也会删除；对应的 uTools 指令一并移除。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
