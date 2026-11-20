// 生词本列表视图（功能指令「生词本」）：搜索、新加的在前、编辑、删除（先确认）、手动添加、导出 JSON / CSV。
// 数据只在本机（localStore 键 vocab），见 repository.ts。
import type { LangCodeISO6393 } from '@read-frog/definitions'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/base-ui/button'
import { Input } from '@/components/ui/base-ui/input'
import { UTF8_BOM } from '@/utils/glossary/csv'
import { getLanguageName } from '@/utils/language-labels'
import type { ViewProps } from '../entry/contract.ts'
import { getPrefs } from '../entry/prefs.ts'
import { ConfirmDelete } from '../glossary/confirm-delete.tsx'
import { errorText, Note } from '../settings/ui.tsx'
import type { VocabEntry } from './contract.ts'
import { filterEntries, formatVocabCsv, formatVocabJson } from './logic.ts'
import { deleteVocab, listVocab } from './repository.ts'
import { UNKNOWN_LANG, UNKNOWN_LANG_LABEL, VocabForm } from './vocab-form.tsx'

const langLabel = (code: string) => (code === UNKNOWN_LANG ? UNKNOWN_LANG_LABEL : getLanguageName(code as LangCodeISO6393))

const today = () => new Date().toISOString().slice(0, 10)

export default function VocabView(_props: ViewProps) {
  const [entries, setEntries] = useState<VocabEntry[]>()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<VocabEntry | 'new'>()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  const reload = useCallback(() => {
    listVocab().then(
      (list) => {
        setEntries(list)
        setError(undefined)
      },
      (e: unknown) => setError(`读取生词本失败：${errorText(e)}`),
    )
  }, [])
  useEffect(reload, [reload])

  const run = async (task: () => Promise<unknown>) => {
    setMessage(undefined)
    try {
      await task()
    } catch (e) {
      setError(errorText(e))
    }
    reload()
  }

  const exportAs = (ext: 'json' | 'csv') =>
    run(async () => {
      const list = await listVocab()
      const text = ext === 'json' ? formatVocabJson(list) : UTF8_BOM + formatVocabCsv(list)
      const saved = await window.services.files.saveTextAs(`洪译生词本-${today()}.${ext}`, text)
      if (saved) setMessage(`已导出 ${list.length} 条到 ${saved}`)
    })

  const native = getPrefs().direction.native
  const shown = entries ? filterEntries(entries, query) : []

  const done = (text: string) => {
    setEditing(undefined)
    setMessage(text)
    reload()
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4" style={{ overflowWrap: 'anywhere' }}>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-base font-semibold">生词本</h1>
        <span className="text-sm text-muted-foreground">{entries ? `${entries.length} 条` : ''}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setEditing('new')}>
            添加
          </Button>
          <Button size="sm" variant="outline" disabled={!entries?.length} onClick={() => void exportAs('json')}>
            导出 JSON
          </Button>
          <Button size="sm" variant="outline" disabled={!entries?.length} onClick={() => void exportAs('csv')}>
            导出 CSV
          </Button>
        </div>
      </header>
      <Note>只存在本机，不随 uTools 账号同步。</Note>
      <Input placeholder="搜索原文或释义" value={query} onChange={(e) => setQuery(e.target.value)} />
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      {message && <p className="text-[13px] text-muted-foreground">{message}</p>}
      {editing === 'new' && (
        <VocabForm
          initial={{ term: '', meaning: '', sourceLang: UNKNOWN_LANG, targetLang: native }}
          mode={{ kind: 'add', from: 'manual' }}
          onSaved={done}
          onCancel={() => setEditing(undefined)}
        />
      )}
      {entries && entries.length === 0 && <Note>还没有生词。翻译短词时点「加入生词本」或按 Ctrl+D 收藏。</Note>}
      {entries && entries.length > 0 && shown.length === 0 && <Note>没有匹配的生词。</Note>}
      {shown.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {shown.map((e) =>
            editing !== 'new' && editing?.id === e.id ? (
              <li key={e.id} className="p-2">
                <VocabForm
                  initial={{ term: e.term, meaning: e.meaning, sourceLang: e.sourceLang, targetLang: e.targetLang }}
                  mode={{ kind: 'edit', id: e.id }}
                  onSaved={done}
                  onCancel={() => setEditing(undefined)}
                />
              </li>
            ) : (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{e.term}</span>
                  <span className="text-sm whitespace-pre-wrap">{e.meaning}</span>
                  <span className="text-xs text-muted-foreground">
                    {langLabel(e.sourceLang)} → {langLabel(e.targetLang)} · {new Date(e.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                  编辑
                </Button>
                <ConfirmDelete title="删除这条生词？" onConfirm={() => void run(() => deleteVocab(e.id))}>
                  「{e.term}」会从生词本里删除，不能恢复。
                </ConfirmDelete>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}
