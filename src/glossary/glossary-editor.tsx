// 单个术语表的编辑区：术语列表（新增、编辑、删除、启用）与 CSV 导入导出。
// 设置页很窄（150% 缩放下约 533 px），术语按两行的列表项显示，不用多列表格，避免横向溢出。
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/base-ui/button'
import { Checkbox } from '@/components/ui/base-ui/checkbox'
import { decodeGlossaryCsv, parseGlossaryCsv, UTF8_BOM } from '@/utils/glossary/csv'
import { ALL_LANGUAGES } from '@/utils/glossary/target-language'
import { getLanguageName } from '@/utils/language-labels'
import { errorText, Note } from '../settings/ui.tsx'
import { ConfirmDelete } from './confirm-delete.tsx'
import { exportFileName, importSummary, MISSING_HEADER, skippedLines } from './csv-logic.ts'
import type { Glossary, GlossaryTerm } from './repository.ts'
import { deleteGlossaryTerm, exportGlossaryCsv, importGlossaryRows, setGlossaryTermEnabled } from './repository.ts'
import { ALL_LANGUAGES_LABEL, TermForm } from './term-form.tsx'
import { useTerms } from './use-glossaries.ts'

interface Props {
  glossary: Glossary
  /** 跑一次写入并刷新术语表列表（术语数）；失败返回错误文本。 */
  run: (task: () => Promise<unknown>) => Promise<string | undefined>
}

const langLabel = (lang: GlossaryTerm['targetLang']) => (lang === ALL_LANGUAGES ? ALL_LANGUAGES_LABEL : getLanguageName(lang))

export function GlossaryEditor({ glossary, run }: Props) {
  const [version, setVersion] = useState(0)
  const { terms, error: loadError } = useTerms(glossary.id, version)
  const [editing, setEditing] = useState<GlossaryTerm | 'new'>()
  const [error, setError] = useState<string>()
  const [importReport, setImportReport] = useState<{ summary: string; skipped: string[] }>()
  const fileInput = useRef<HTMLInputElement>(null)

  const write = async (task: () => Promise<unknown>) => {
    setError(await run(task))
    setVersion((v) => v + 1)
  }

  const exportCsv = () =>
    write(async () => {
      const csv = await exportGlossaryCsv(glossary.id)
      await window.services.files.saveTextAs(exportFileName(glossary.name), UTF8_BOM + csv)
    })

  const importFile = async (file: File) => {
    setImportReport(undefined)
    let parsed: ReturnType<typeof parseGlossaryCsv>
    try {
      parsed = parseGlossaryCsv(decodeGlossaryCsv(await file.arrayBuffer()))
    } catch (e) {
      setError(`读取文件失败：${errorText(e)}`)
      return
    }
    if (!parsed.ok) {
      setImportReport({ summary: MISSING_HEADER, skipped: [] })
      return
    }
    const { rows, skipped } = parsed
    await write(async () => {
      const result = await importGlossaryRows(glossary.id, rows, 'merge')
      setImportReport({ summary: importSummary(result), skipped: skippedLines(skipped) })
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      {loadError && <p className="text-[13px] text-destructive">{loadError}</p>}
      {terms && terms.length === 0 && <Note>还没有术语。</Note>}
      {terms && terms.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {terms.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <Checkbox
                aria-label="启用"
                checked={t.enabled}
                onCheckedChange={(on) => void write(() => setGlossaryTermEnabled(t.id, on))}
              />
              <div className="flex min-w-0 flex-1 flex-col" style={{ overflowWrap: 'anywhere' }}>
                <span className="text-sm">
                  {t.source} → {t.target === '' ? <span className="text-muted-foreground">保留原文</span> : t.target}
                </span>
                <span className="text-xs text-muted-foreground">
                  {langLabel(t.targetLang)}
                  {t.caseSensitive && ' · 区分大小写'}
                  {!t.enabled && ' · 未启用'}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                  编辑
                </Button>
                <ConfirmDelete title={`删除术语「${t.source}」？`} onConfirm={() => void write(() => deleteGlossaryTerm(t.id))}>
                  删除后不能恢复。
                </ConfirmDelete>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <TermForm
          key={editing === 'new' ? 'new' : editing.id}
          glossaryId={glossary.id}
          term={editing === 'new' ? undefined : editing}
          onDone={() => {
            setEditing(undefined)
            void write(async () => {})
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setEditing('new')}>
            添加术语
          </Button>
          <Button size="sm" variant="outline" onClick={() => void exportCsv()}>
            导出 CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            导入 CSV
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importFile(file)
            }}
          />
        </div>
      )}
      <Note>CSV 四列：source,target,targetLanguage,caseSensitive（与导出的文件相同）；targetLanguage 写 ISO 639-3 代码或 all。导入按原文合并：已有的更新，没有的新增，不删除。</Note>
      {importReport && (
        <div className="flex flex-col gap-1 text-[13px]">
          <p>{importReport.summary}</p>
          {importReport.skipped.length > 0 && (
            <>
              <p className="text-muted-foreground">跳过 {importReport.skipped.length} 行：</p>
              <ul className="max-h-40 overflow-auto text-muted-foreground">
                {importReport.skipped.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  )
}
