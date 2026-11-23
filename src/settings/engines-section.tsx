// 引擎列表：uTools AI 固定第一个（不可删）；其余可添加、编辑、删除。删除时撤销端点授权和 key。
import { useState } from 'react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/base-ui/select'
import { getRandomUUID } from '@/utils/crypto-polyfill'
import { DEFAULT_PROVIDER_CONFIG } from '@/utils/constants/providers'
import { getEngineChoice, resolveDefaultEngine, setEngineChoice, usableEngines } from '../entry/default-engine.ts'
import { UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'
import { EngineForm } from './engine-form.tsx'
import type { EngineRow, EngineType } from './logic.ts'
import { ENGINE_TYPES, isEngineType, newEngineRow } from './logic.ts'
import { ConfigItem, errorText, Note } from './ui.tsx'
import { useEngines } from './use-engines.ts'

const ENGINE_TYPE_LIST = Object.keys(ENGINE_TYPES) as EngineType[]
const AUTO_VALUE = '__auto__'

/** 默认引擎下拉：自动，或某个启用的引擎。所选引擎停用或删除后显示为自动（resolveDefaultEngine 同样回到自动规则）。 */
function DefaultEngineItem({ rows, choice, onChange }: { rows: EngineRow[]; choice: string | null; onChange: (id: string | null) => void }) {
  const usable = usableEngines(rows)
  const value = choice !== null && usable.some((r) => r.id === choice) ? choice : AUTO_VALUE
  const autoLabel = `自动（现在是 ${resolveDefaultEngine(rows, null)?.name ?? '无'}）`
  const labelOf = (v: string) => (v === AUTO_VALUE ? autoLabel : (usable.find((r) => r.id === v)?.name ?? v))
  // 下拉里的引擎名长短不定：控件放在说明下面占整行（上游 ConfigItem 的 vertical），窄窗口里也不会被挤成省略号。
  return (
    <ConfigItem
      title="默认引擎"
      orientation="vertical"
      description="「翻译并粘回」「文件翻译」「截图翻译」和搜索框直出用这个引擎。自动：有启用的自定义引擎就用列表里第一个，否则用 uTools AI。"
    >
      <Select value={value} onValueChange={(v) => onChange(v === AUTO_VALUE ? null : (v as string))}>
        <SelectTrigger size="sm" className="max-w-full">
          <SelectValue render={<span />}>{labelOf(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={AUTO_VALUE}>{autoLabel}</SelectItem>
          {usable.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ConfigItem>
  )
}

function keyLabel(row: EngineRow, hasKey: boolean | undefined): string {
  if (row.id === UTOOLS_AI_PROVIDER_ID) return '内置，免配置'
  if (!isEngineType(row.provider) || ENGINE_TYPES[row.provider].keyMode === 'none') return '无需 key'
  if (hasKey === undefined) return '…'
  return hasKey ? 'key 已保存' : 'key 未设置'
}

export function EnginesSection() {
  const { rows, allNames, keyStatus, putRow, removeRow } = useEngines()
  const [editing, setEditing] = useState<{ row: EngineRow; isNew: boolean }>()
  const [addType, setAddType] = useState<EngineType>('openai-compatible')
  const [error, setError] = useState<string>()
  const [choice, setChoice] = useState(getEngineChoice)
  const defaultId = resolveDefaultEngine(rows, choice)?.id
  const changeChoice = (id: string | null) => {
    setEngineChoice(id)
    setChoice(id)
  }

  const startAdd = () => {
    const upstreamDefault = DEFAULT_PROVIDER_CONFIG[addType]
    setEditing({ row: newEngineRow(addType, getRandomUUID(), upstreamDefault, allNames), isNew: true })
  }
  const remove = async (id: string) => {
    setError(undefined)
    try {
      await removeRow(id)
      if (editing?.row.id === id) setEditing(undefined)
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <Note>OpenAI、DeepSeek 和 DeepL 只连接官方端点。旧版或从其他设备同步过来的引擎需在本机重新保存；如使用 API key，请在保存时重新填写。</Note>
      <DefaultEngineItem rows={rows} choice={choice} onChange={changeChoice} />
      <ul className="flex flex-col divide-y rounded-lg border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {row.name}
                {row.id === defaultId && <span className="ml-2 text-xs text-muted-foreground">默认</span>}
                {!row.enabled && <span className="ml-2 text-xs text-muted-foreground">未启用</span>}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {row.id === UTOOLS_AI_PROVIDER_ID ? 'uTools 内置' : (row.baseURL ?? '未填写地址')} · {keyLabel(row, keyStatus[row.id])}
              </span>
            </div>
            {row.id !== UTOOLS_AI_PROVIDER_ID && isEngineType(row.provider) && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing({ row, isNew: false })}>
                  编辑
                </Button>
                <DeleteButton name={row.name} onConfirm={() => void remove(row.id)} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      {editing && isEngineType(editing.row.provider) ? (
        <EngineForm
          key={editing.row.id}
          row={editing.row}
          type={editing.row.provider}
          isNew={editing.isNew}
          hasKey={!editing.isNew && keyStatus[editing.row.id] === true}
          otherNames={allNames.filter((n) => n !== editing.row.name)}
          onSaved={async (row) => {
            await putRow(row)
            setEditing(undefined)
          }}
          onCancel={() => setEditing(undefined)}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Select value={addType} onValueChange={(v) => setAddType(v as EngineType)}>
            <SelectTrigger size="sm">
              <SelectValue render={<span />}>{ENGINE_TYPES[addType].label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ENGINE_TYPE_LIST.map((t) => (
                <SelectItem key={t} value={t}>
                  {ENGINE_TYPES[t].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={startAdd}>
            添加引擎
          </Button>
        </div>
      )}
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
          <AlertDialogDescription>同时删除本机保存的 key。用到它的功能会改用 uTools AI 或剩下的第一个引擎。</AlertDialogDescription>
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
