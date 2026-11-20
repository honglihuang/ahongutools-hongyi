// 截图翻译视图：功能指令进入 → utools.screenCapture()；img 匹配进入 → payload 的 Data URL。
// 跟默认引擎一步识别 + 翻译（vision-engine.ts：能收图片的默认引擎，否则 uTools AI 视觉模型）；界面标出实际用的引擎与改用原因。
// 原文可改，改后「重新翻译」走 translateOnce（文本引擎）。
// 术语表：一步识别时还不知道原文，用不上术语；识别后若 translateOnce 对这段原文会带上术语，就自动经 translateOnce 重译一次，
// 没有命中术语时不多发请求。当前提示词是自定义的话，一步识别不用它，结果下方说明一句。
// 首次使用先提示截图会发给哪个引擎，确认后才发送；同意按引擎记（存已同意的引擎 id，dbStorage 随账号同步），引擎变了再问。
import type { ViewProps } from '../entry/contract.ts'
import type { UtoolsAiModel } from '../engine/contract.ts'
import type { VisionTarget } from './vision-engine.ts'
import * as React from 'react'
import { Button } from '@/components/ui/base-ui/button'
import { Textarea } from '@/components/ui/base-ui/textarea'
import { detectLanguage } from '@/utils/content/language'
import { resolveTargetLang } from '../engine/direction.ts'
import { getPrefs } from '../entry/prefs.ts'
import { currentPrompt, matchedTermsFor, translateOnce } from '../entry/translate.ts'
import { captureScreen } from './screen-capture.ts'
import {
  CONSENT_KEY,
  canRecognize,
  consentText,
  engineLine,
  fallbackPickerLabel,
  hasShotConsent,
  plannedLine,
} from './shot-logic.ts'
import { listVisionModels } from './vision.ts'
import { planVisionTarget, recognizeWithDefaultEngine } from './vision-default.ts'
import type { VocabDraft } from '../vocab/contract.ts'
import AddToVocabButton from '../vocab/add-button.tsx'
import { canAddToVocab, guessSourceLang } from '../vocab/logic.ts'

type Status =
  | { kind: 'capturing' }
  | { kind: 'cancelled' }
  | { kind: 'consent' }
  | { kind: 'busy'; label: string }
  | { kind: 'idle'; note?: string }
  | { kind: 'error'; message: string }

/**
 * 「加入生词本」的草稿：原文 = 识别出（可能已改过）的原文，释义 = 当前译文。
 * 语言按 translateOnce 的规则推：上游 franc 检测原文（不调用 LLM）+ resolveTargetLang；检测不出时原文语言为 'und'。
 */
function useVocabDraft(source: string, translation: string): VocabDraft | null {
  const short = translation !== '' && canAddToVocab(source)
  const [detected, setDetected] = React.useState<{ text: string; lang: string | null } | null>(null)
  React.useEffect(() => {
    if (!short) return
    let live = true
    detectLanguage(source, { minLength: 1, enableLLM: false }).then(
      (lang) => live && setDetected({ text: source, lang }),
      () => live && setDetected({ text: source, lang: null }),
    )
    return () => void (live = false)
  }, [short, source])
  if (!short || detected?.text !== source) return null
  const sourceLang = guessSourceLang(source, detected.lang)
  const targetLang = resolveTargetLang(detected.lang ?? undefined, getPrefs().direction)
  return { term: source, meaning: translation, sourceLang, targetLang, from: 'shot' }
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

export default function ShotView({ action }: ViewProps) {
  const [image, setImage] = React.useState<string | null>(null)
  const [models, setModels] = React.useState<UtoolsAiModel[] | null>(null)
  const [model, setModel] = React.useState('')
  const [source, setSource] = React.useState('')
  const [translation, setTranslation] = React.useState('')
  /** 截图会先发给的引擎（按当前默认引擎算）；null = 还没算。 */
  const [target, setTarget] = React.useState<VisionTarget | null>(null)
  /** 上次识别实际用的引擎说明。 */
  const [usedLine, setUsedLine] = React.useState('')
  /** 当前是自定义提示词时的说明（一步识别没用它）；空 = 不显示。 */
  const [promptLine, setPromptLine] = React.useState('')
  const [modelsError, setModelsError] = React.useState('')
  const [status, setStatus] = React.useState<Status>({ kind: 'capturing' })
  const abortRef = React.useRef<AbortController | null>(null)
  const vocabDraft = useVocabDraft(source, translation)
  // StrictMode 下开发期 effect 会跑两次：同一个 action 只截一次图。
  const startedFor = React.useRef<unknown>(Symbol('none'))

  // 只认最近一次截图的结果。
  const captureSeq = React.useRef(0)

  const capture = React.useCallback(() => {
    const seq = ++captureSeq.current
    setStatus({ kind: 'capturing' })
    // 7.8.0 下取消截图可能不回调，Promise 一直未决：页面保持可用，「重新截图」随时可点。
    captureScreen().then(
      (dataUrl) => {
        if (seq === captureSeq.current) setImage(dataUrl)
      },
      // 返回 Promise 的运行时在用户取消截图时会 reject（screen.md）。
      () => {
        if (seq === captureSeq.current) setStatus({ kind: 'cancelled' })
      },
    )
  }, [])

  React.useEffect(() => {
    if (startedFor.current === action) return
    startedFor.current = action
    abortRef.current?.abort()
    setImage(null)
    setSource('')
    setTranslation('')
    setUsedLine('')
    setPromptLine('')
    if (action?.type === 'img' && typeof action.payload === 'string') setImage(action.payload)
    else capture()
  }, [action, capture])

  React.useEffect(() => {
    listVisionModels().then(
      (list) => {
        setModels(list)
        setModel((m) => m || (list[0]?.id ?? ''))
      },
      // 默认引擎能收图片时不需要 uTools AI：当作没有视觉模型，只在要用 uTools AI 时显示这个错误。
      (e: unknown) => {
        setModels([])
        setModelsError(`读取 uTools AI 模型失败：${errorText(e)}`)
      },
    )
  }, [])

  React.useEffect(() => () => abortRef.current?.abort(), [])

  /** 跑一个可取消的任务；新任务会取消旧任务。 */
  const runTask = async (label: string, task: (signal: AbortSignal) => Promise<string | undefined>) => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setStatus({ kind: 'busy', label })
    try {
      const note = await task(ac.signal)
      if (!ac.signal.aborted) setStatus({ kind: 'idle', note })
    } catch (e) {
      if (!ac.signal.aborted) setStatus({ kind: 'error', message: errorText(e) })
      else if (!isAbort(e)) console.warn(e)
    } finally {
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  const recognize = (img: string, modelId: string) =>
    runTask('识别并翻译中…', async (signal) => {
      setUsedLine('')
      setPromptLine('')
      const r = await recognizeWithDefaultEngine(img, { direction: getPrefs().direction, utoolsModel: modelId, signal })
      if (signal.aborted) return
      setSource(r.source)
      setTranslation(r.translation)
      setUsedLine(engineLine(r))
      const prompt = await currentPrompt().catch(() => undefined)
      if (signal.aborted) return
      if (prompt?.custom) setPromptLine(`识别时的一步翻译没有用自定义提示词「${prompt.name}」；点「重新翻译」会用上。`)
      const rawNote = r.raw ? '模型没有按约定格式返回原文，整段回复显示为译文。' : undefined
      if (r.raw || r.source.trim() === '') return rawNote
      const terms = await matchedTermsFor(r.source).catch(() => [])
      if (signal.aborted || terms.length === 0) return rawNote
      setStatus({ kind: 'busy', label: '按术语表重新翻译中…' })
      const again = await translateOnce(r.source, { signal })
      if (signal.aborted) return
      setTranslation(again.text)
      // 重译走 translateOnce，已经用上当前提示词。
      setPromptLine('')
      return '已按术语表重新翻译'
    })

  // 识别前先按当前默认引擎算出发给谁：只有要用 uTools AI 时才要求它有视觉模型；没同意过这个引擎就先提示。
  const startSeq = React.useRef(0)
  const start = async (img: string, modelId: string) => {
    const seq = ++startSeq.current
    let t: VisionTarget
    try {
      t = await planVisionTarget(modelId)
    } catch (e) {
      if (seq === startSeq.current) setStatus({ kind: 'error', message: `读取翻译引擎配置失败：${errorText(e)}` })
      return
    }
    if (seq !== startSeq.current) return
    setTarget(t)
    if (!canRecognize(t, modelId)) setStatus({ kind: 'idle' })
    else if (!hasShotConsent(utools.dbStorage.getItem(CONSENT_KEY), t.id)) setStatus({ kind: 'consent' })
    else void recognize(img, modelId)
  }

  const retranslate = () =>
    runTask('重新翻译中…', async (signal) => {
      const r = await translateOnce(source, { signal })
      if (!signal.aborted) {
        setTranslation(r.text)
        setPromptLine('')
      }
      return undefined
    })

  // 有图、uTools AI 模型列表已读到时自动识别一次（列表决定改用 uTools AI 时的视觉模型）。
  const autoRunFor = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!image || models === null || autoRunFor.current === image) return
    autoRunFor.current = image
    void start(image, model)
  }, [image, models, model])

  const accept = () => {
    if (!target) return
    utools.dbStorage.setItem(CONSENT_KEY, target.id)
    if (image) void recognize(image, model)
  }

  const busy = status.kind === 'busy'
  const blocked = target !== null && !canRecognize(target, model)

  // Tailwind 只扫描 upstream 源码（theme.css 的 source），上游没用过的类不会生成，这几处用内联样式。
  // overflowWrap: 'anywhere'（可继承）：没有空格的长模型 id、错误原文在窄窗口里折行，不撑出横向滚动。
  return (
    <div className="flex flex-col gap-3 p-4" style={{ height: '100vh', overflowWrap: 'anywhere' }}>
      {/* 窄窗口下各项换行，不横向溢出。引擎按 planVisionTarget 显示；uTools AI 模型下拉只在会用到时显示，并写明是主引擎还是改用时的模型。 */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-base font-semibold">截图翻译</h1>
        {target && (
          <span className="min-w-0 text-sm text-muted-foreground">{plannedLine(target, model)}</span>
        )}
        {target && models && models.length > 0 && (
          <label className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            {fallbackPickerLabel(target)}
            <select
              className="h-7 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm"
              style={{ color: 'var(--color-foreground)' }}
              value={model}
              disabled={busy}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button variant="outline" size="sm" className="ml-auto" disabled={busy} onClick={capture}>
          重新截图
        </Button>
      </header>

      {status.kind === 'capturing' && !image && (
        <p className="text-sm text-muted-foreground">
          请框选要翻译的屏幕区域…已取消截图的话，点「重新截图」再试，或按 Esc 离开。
        </p>
      )}
      {status.kind === 'cancelled' && !image && (
        <p className="text-sm text-muted-foreground">已取消截图。点「重新截图」再试，或把图片粘贴到 uTools 搜索框。</p>
      )}
      {blocked && target && (
        <p className="text-sm text-destructive">
          {target.reason ? `${target.reason}。` : ''}
          {modelsError ||
            '当前 uTools AI 没有支持图片输入（视觉）的模型，无法识别截图。可以在 uTools 的 AI 设置里添加视觉模型，或在「洪译设置」里把默认引擎设为 OpenAI 兼容接口 / OpenAI 后重试。'}
        </p>
      )}
      {status.kind === 'consent' && target && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <p>{consentText(target, model)}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={accept}>
              知道了，继续
            </Button>
            <Button size="sm" variant="outline" onClick={() => utools.outPlugin()}>
              取消
            </Button>
          </div>
        </div>
      )}
      {status.kind === 'error' && <p className="text-sm text-destructive">{status.message}</p>}
      {status.kind === 'idle' && status.note && <p className="text-sm text-muted-foreground">{status.note}</p>}
      {usedLine && <p className="text-xs text-muted-foreground">{usedLine}</p>}
      {promptLine && <p className="text-xs text-muted-foreground">{promptLine}</p>}

      {image && (
        <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)' }}>
          <img
            src={image}
            alt="截图"
            className="w-full rounded-lg border object-contain"
            style={{ maxHeight: '100%', objectPosition: 'top' }}
          />
          <div className="flex min-h-0 flex-col gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="shot-source">
              原文（可修改）
            </label>
            <Textarea
              id="shot-source"
              className="overflow-auto"
              style={{ maxHeight: '12rem' }}
              value={source}
              disabled={busy}
              onChange={(e) => setSource(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={busy || source.trim() === ''} onClick={() => void retranslate()}>
                重新翻译
              </Button>
              {target && !blocked && status.kind !== 'consent' && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void start(image, model)}>
                  重新识别
                </Button>
              )}
              {busy && (
                <>
                  <span className="text-sm text-muted-foreground">{status.label}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      abortRef.current?.abort()
                      setStatus({ kind: 'idle' })
                    }}
                  >
                    取消
                  </Button>
                </>
              )}
            </div>
            <span className="text-xs text-muted-foreground">译文</span>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border p-2.5 text-sm whitespace-pre-wrap">
              {translation}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={translation === ''} onClick={() => utools.copyText(translation)}>
                复制译文
              </Button>
              <AddToVocabButton draft={busy ? null : vocabDraft} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
