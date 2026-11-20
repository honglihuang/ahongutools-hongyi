// 文件翻译视图（files 匹配 txt/md/srt）：读取 → 按格式分批翻译（进度、可取消）→ 预览 → 另存为新文件。
// 取消或失败时不写任何文件；另存为不允许选源文件（FilesApi.saveTextAs 的 avoidPath）。
import type { ViewProps } from '../entry/contract.ts'
import { franc } from 'franc'
import * as React from 'react'
import { Button } from '@/components/ui/base-ui/button'
import { Progress } from '@/components/ui/base-ui/progress'
import { resolveTargetLang } from '../engine/direction.ts'
import { assertWithinLimit, charCount } from './formats/doc.ts'
import { type FileFormat, formatOf, parseByFormat, translatedFilePath } from './formats/index.ts'
import { type RunProgress, translateDoc } from './formats/run.ts'
import { getPrefs } from '../entry/prefs.ts'
import { translateOnce } from '../entry/translate.ts'
import { langName } from './lang.ts'

interface Source {
  path: string
  name: string
  format: FileFormat
  text: string
  chars: number
  target: string
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }
  | { kind: 'running'; progress: RunProgress }
  | { kind: 'done'; text: string; fallback: number; savedTo?: string }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

/** payload 是 MatchFile[]（plugin-json.md files 匹配），取第一个。 */
function firstFile(payload: unknown): { path: string; name: string } | null {
  const first = Array.isArray(payload) ? (payload[0] as Partial<{ path: string; name: string; isFile: boolean }>) : null
  if (!first || typeof first.path !== 'string' || first.isFile === false) return null
  return { path: first.path, name: typeof first.name === 'string' ? first.name : first.path }
}

async function loadSource(payload: unknown): Promise<Source> {
  const file = firstFile(payload)
  if (!file) throw new Error('没有收到文件：请把 .txt、.md 或 .srt 文件拖进 uTools 搜索框')
  const format = formatOf(file.name)
  if (!format) throw new Error(`只支持 .txt、.md、.srt 文件：${file.name}`)
  const { text } = await window.services.files.readText(file.path)
  assertWithinLimit(text)
  if (text.trim() === '') throw new Error(`文件是空的：${file.name}`)
  // 整个文件用同一个目标语言（逐批检测会在中英混排时来回切换）。
  const detected = franc(text.slice(0, 5000), { minLength: 3 })
  const target = resolveTargetLang(detected === 'und' ? undefined : detected, getPrefs().direction)
  return { ...file, format, text, chars: charCount(text), target }
}

export default function FileView({ action }: ViewProps) {
  const [source, setSource] = React.useState<Source | null>(null)
  const [phase, setPhase] = React.useState<Phase>({ kind: 'loading' })
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    let alive = true
    setSource(null)
    setPhase({ kind: 'loading' })
    loadSource(action?.payload).then(
      (s) => alive && (setSource(s), setPhase({ kind: 'ready' })),
      (e: unknown) => alive && setPhase({ kind: 'error', message: errorText(e) }),
    )
    return () => {
      alive = false
      abortRef.current?.abort()
    }
  }, [action])

  const start = async () => {
    if (!source) return
    const ac = new AbortController()
    abortRef.current = ac
    const doc = parseByFormat(source.format, source.text)
    setPhase({ kind: 'running', progress: { done: 0, total: doc.units.length } })
    try {
      const r = await translateDoc(
        doc,
        async (text, signal) => (await translateOnce(text, { target: source.target, signal })).text,
        { signal: ac.signal, onProgress: (progress) => !ac.signal.aborted && setPhase({ kind: 'running', progress }) },
      )
      setPhase({ kind: 'done', text: r.text, fallback: r.fallback })
    } catch (e) {
      setPhase(isAbort(e) ? { kind: 'ready' } : { kind: 'error', message: `翻译失败，未写入任何文件：${errorText(e)}` })
    } finally {
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  const save = async () => {
    if (!source || phase.kind !== 'done') return
    try {
      const saved = await window.services.files.saveTextAs(
        translatedFilePath(source.path, source.name),
        phase.text,
        source.path,
      )
      if (saved) setPhase({ ...phase, savedTo: saved })
    } catch (e) {
      utools.showNotification(`保存失败：${errorText(e)}`)
    }
  }

  return (
    // Tailwind 只扫描 upstream 源码（theme.css 的 source），上游没用过的类不会生成，这里用内联样式。
    <div className="flex flex-col gap-3 p-4" style={{ height: '100vh' }}>
      <header className="flex items-baseline gap-2">
        <h1 className="text-base font-semibold">文件翻译</h1>
        {source && (
          <span className="truncate text-sm text-muted-foreground">
            {source.name} · {source.chars.toLocaleString()} 字 · 译成{langName(source.target)}
          </span>
        )}
      </header>
      {phase.kind === 'loading' && <p className="text-sm text-muted-foreground">读取文件…</p>}
      {phase.kind === 'error' && <p className="text-sm text-destructive">{phase.message}</p>}
      {phase.kind === 'ready' && source && (
        <>
          <pre className="min-h-0 flex-1 overflow-auto rounded-lg border p-3 text-sm whitespace-pre-wrap">{source.text}</pre>
          <div className="flex gap-2">
            <Button onClick={() => void start()}>开始翻译</Button>
          </div>
        </>
      )}
      {phase.kind === 'running' && (
        <div className="flex flex-col gap-2">
          <Progress value={phase.progress.total ? (phase.progress.done / phase.progress.total) * 100 : 0} />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              已翻译 {phase.progress.done} / {phase.progress.total} 段
            </span>
            <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
              取消
            </Button>
          </div>
        </div>
      )}
      {phase.kind === 'done' && (
        <>
          {phase.fallback > 0 && (
            <p className="text-sm text-muted-foreground">
              有 {phase.fallback} 段的译文改动了代码或链接，已保留原文。
            </p>
          )}
          <pre className="min-h-0 flex-1 overflow-auto rounded-lg border p-3 text-sm whitespace-pre-wrap">{phase.text}</pre>
          <div className="flex items-center gap-2">
            <Button onClick={() => void save()}>另存为…</Button>
            <Button variant="outline" onClick={() => utools.copyText(phase.text)}>
              复制译文
            </Button>
            {phase.savedTo && (
              <Button variant="link" onClick={() => utools.shellShowItemInFolder(phase.savedTo!)}>
                已保存：{phase.savedTo}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
