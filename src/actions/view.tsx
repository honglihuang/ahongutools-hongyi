// 动作视图。两种进入方式：
// - 动态指令 hongyi-action-<id>（over 文字）：直接对文字运行这个动作；动作已删除时提示并重新对账。
// - 功能指令「AI 动作」：over 进入显示文字和动作列表；关键字进入用 uTools 子输入框输入文字。↑↓ 或 1–9 选，回车运行。
// 运行前后显示用哪个引擎；uTools AI 加一句会消耗能量，本机第一次用 uTools AI 运行要先确认（localStore 键 ENERGY_ACK_KEY）。
// 结果是不可信的模型输出：只当 React 文本节点渲染（whitespace-pre-wrap），不解析 HTML / Markdown，没有可点的链接。
import { useAtomValue, useStore } from 'jotai'
import * as React from 'react'
import { Button } from '@/components/ui/base-ui/button'
import { configFieldsAtomMap } from '@/utils/atoms/config'
import { ACTION_FEATURE_PREFIX, type ViewProps } from '../entry/contract.ts'
import { getEngineChoice } from '../entry/default-engine.ts'
import { copyAndLeave, pasteBack } from '../entry/deliver.ts'
import { getPrefs } from '../entry/prefs.ts'
import { moveSelection } from '../entry/hub-keys.ts'
import { useSubInput } from '../entry/views/use-sub-input.ts'
import { actionIdOfCode, type CustomAction, type ViewPhase, viewKeyAction } from './logic.ts'
import { type ActionTarget, resolveActionTarget, runAction } from './run.ts'
import { reconcileCommands } from './store.ts'

export const ENERGY_ACK_KEY = 'actions-energy-ack'

type Phase =
  | { kind: 'pick' }
  | { kind: 'confirm'; action: CustomAction; target: ActionTarget; source: string }
  | { kind: 'running' | 'done'; action: CustomAction; target: ActionTarget; text: string }
  | { kind: 'error'; action?: CustomAction; target?: ActionTarget; message: string }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError'

const overText = (action: ViewProps['action']) =>
  action && typeof action.payload === 'string' && (action.type === 'over' || action.type === 'regex') ? action.payload : ''

/** 焦点在页面里的按钮或输入框：按键交给它。 */
const inField = (el: Element | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName))

const keepFocus = (e: React.MouseEvent) => e.preventDefault()

/** 关键字进入时才挂 uTools 子输入框（单独成组件，hook 不放在条件里）。 */
function SubInput({ onChange }: { onChange: (text: string) => void }) {
  useSubInput(onChange, '输入要处理的文字', '')
  return null
}

function EngineLine({ target }: { target: ActionTarget }) {
  return (
    <p className="text-xs text-muted-foreground">
      引擎：{target.name}
      {target.isUtoolsAi && '（会消耗 uTools AI 能量）'}
      {target.reason && <span className="block">{target.reason}</span>}
    </p>
  )
}

export default function ActionView({ action: enter }: ViewProps) {
  const store = useStore()
  const actions = useAtomValue(configFieldsAtomMap.selectionToolbar).customActions
  const providers = useAtomValue(configFieldsAtomMap.providersConfig)
  const fixedId = enter?.code.startsWith(ACTION_FEATURE_PREFIX) ? actionIdOfCode(enter.code) : undefined
  const overSource = React.useMemo(() => overText(enter), [enter])
  const keywordEntry = fixedId === undefined && overSource === ''
  const [typed, setTyped] = React.useState('')
  const source = keywordEntry ? typed : overSource
  const [selected, setSelected] = React.useState(0)
  const [phase, setPhase] = React.useState<Phase>({ kind: 'pick' })
  const abortRef = React.useRef<AbortController | null>(null)
  // 视图已卸载（插件退出）时，还没发出的请求不再发。
  const aliveRef = React.useRef(true)
  React.useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const execute = React.useCallback(async (action: CustomAction, target: ActionTarget, text: string) => {
    if (!aliveRef.current) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setPhase({ kind: 'running', action, target, text: '' })
    try {
      const out = await runAction(target, action, text, getPrefs().direction.native, {
        signal: ac.signal,
        onText: (t) => {
          if (!ac.signal.aborted) setPhase({ kind: 'running', action, target, text: t })
        },
      })
      if (ac.signal.aborted) return
      setPhase(out.trim() === '' ? { kind: 'error', action, target, message: '模型没有返回内容' } : { kind: 'done', action, target, text: out })
    } catch (e) {
      if (isAbort(e) || ac.signal.aborted) return
      setPhase({ kind: 'error', action, target, message: errorText(e) })
    }
  }, [])

  /** 先算引擎；要用 uTools AI 且本机还没确认过能量提示时，停在确认步骤。 */
  const start = React.useCallback(
    async (action: CustomAction, text: string) => {
      if (text.trim() === '') {
        setPhase({ kind: 'error', action, message: '没有要处理的文字' })
        return
      }
      let target: ActionTarget
      try {
        target = resolveActionTarget(store.get(configFieldsAtomMap.providersConfig), getEngineChoice())
      } catch (e) {
        setPhase({ kind: 'error', action, message: errorText(e) })
        return
      }
      if (target.isUtoolsAi) {
        let acked = false
        try {
          acked = (await window.services.localStore.get<boolean>(ENERGY_ACK_KEY)) === true
        } catch {}
        if (!acked) {
          setPhase({ kind: 'confirm', action, target, source: text })
          return
        }
      }
      void execute(action, target, text)
    },
    [store, execute],
  )

  const confirm = React.useCallback(
    (p: Extract<Phase, { kind: 'confirm' }>) => {
      void window.services.localStore.set(ENERGY_ACK_KEY, true).catch((e: unknown) => console.warn('记录能量提示失败', e))
      void execute(p.action, p.target, p.source)
    },
    [execute],
  )

  // 动态指令进入：直接运行一次。动作已删除（别的设备删的）时提示，并对账删掉这条指令。
  // 只在「找到 / 没找到」变化时重跑：配置刷新换了对象引用不重新运行；StrictMode 的模拟卸载会取消后重新运行一次。
  const fixedAction = fixedId === undefined ? undefined : actions.find((a) => a.id === fixedId)
  const fixedRef = React.useRef(fixedAction)
  fixedRef.current = fixedAction
  const fixedFound = fixedAction !== undefined
  React.useEffect(() => {
    if (fixedId === undefined) return
    if (fixedRef.current) void start(fixedRef.current, overSource)
    else void reconcileCommands()
  }, [fixedId, fixedFound, overSource, start])

  const phaseRef = React.useRef({ phase, selected, source, actions })
  phaseRef.current = { phase, selected, source, actions }
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = phaseRef.current
      const kind: ViewPhase = cur.phase.kind === 'error' ? 'other' : cur.phase.kind
      const act = viewKeyAction(e, fixedId !== undefined && kind === 'pick' ? 'other' : kind, {
        inField: inField(document.activeElement),
        digits: !keywordEntry,
      })
      if (!act) return
      e.preventDefault()
      const list = cur.actions
      switch (act.type) {
        case 'exit':
          utools.outPlugin()
          break
        case 'prev':
        case 'next':
          setSelected((i) => moveSelection(i, list.length, act.type === 'next' ? 1 : -1))
          break
        case 'select':
          if (act.index < list.length) {
            setSelected(act.index)
            void start(list[act.index]!, cur.source)
          }
          break
        case 'run':
          if (list[cur.selected]) void start(list[cur.selected]!, cur.source)
          break
        case 'confirm':
          if (cur.phase.kind === 'confirm') confirm(cur.phase)
          break
        case 'copy':
          if (cur.phase.kind === 'done' && !copyAndLeave(cur.phase.text)) utools.showNotification('复制失败')
          break
        case 'paste':
          if (cur.phase.kind === 'done') pasteBack(cur.phase.text)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fixedId, keywordEntry, start, confirm])

  if (fixedId !== undefined && phase.kind === 'pick') {
    return (
      <p className="px-4 py-4 text-sm text-muted-foreground">
        {fixedAction ? '准备中…' : '这个动作已经删除。可以在「洪译设置」的「AI 动作」里重新添加。'}
      </p>
    )
  }

  const current = phase.kind === 'pick' ? undefined : phase.action
  let pickTarget: ActionTarget | undefined
  let pickError: string | undefined
  if (phase.kind === 'pick') {
    try {
      pickTarget = resolveActionTarget(providers, getEngineChoice())
    } catch (e) {
      pickError = errorText(e)
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {keywordEntry && <SubInput onChange={setTyped} />}
      {!keywordEntry && (
        <section>
          <h2 className="mb-1 text-xs text-muted-foreground">原文</h2>
          <p className="max-h-24 overflow-auto text-sm whitespace-pre-wrap break-words">{source}</p>
        </section>
      )}
      {phase.kind === 'pick' && (
        <>
          {keywordEntry && <p className="text-xs text-muted-foreground">在上方输入框里输入文字，再选一个动作。</p>}
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有动作。可以在「洪译设置」的「AI 动作」里添加。</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {actions.map((a, i) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onMouseDown={keepFocus}
                    onClick={() => {
                      setSelected(i)
                      void start(a, source)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === selected ? 'bg-accent text-accent-foreground' : ''}`}
                  >
                    {!keywordEntry && i < 9 && <span className="w-4 shrink-0 text-xs text-muted-foreground">{i + 1}</span>}
                    <span className="truncate">{a.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pickTarget && <EngineLine target={pickTarget} />}
          {pickError && <p className="text-xs text-destructive break-words">{pickError}</p>}
          <p className="text-xs text-muted-foreground">↑↓{keywordEntry ? '' : ' 或 1–9'} 选择 · 回车运行 · Esc 退出</p>
        </>
      )}
      {phase.kind === 'confirm' && (
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-3">
          <p className="text-sm">「{phase.action.name}」将用 uTools AI 运行，会消耗你的 uTools AI 能量。这个提示在本机只出现一次。</p>
          <EngineLine target={phase.target} />
          <div>
            <Button size="sm" onMouseDown={keepFocus} onClick={() => confirm(phase)}>
              确认运行（回车）
            </Button>
          </div>
        </section>
      )}
      {(phase.kind === 'running' || phase.kind === 'done' || phase.kind === 'error') && (
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-3">
          {current && <h2 className="text-xs text-muted-foreground">{current.name}</h2>}
          {phase.kind === 'error' ? (
            <p className="text-sm text-destructive whitespace-pre-wrap break-words">运行失败：{phase.message}</p>
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words">
              {phase.text || (phase.kind === 'running' ? '运行中…' : '')}
            </p>
          )}
          {phase.target && <EngineLine target={phase.target} />}
          <div className="flex flex-wrap gap-2">
            {phase.kind === 'done' && (
              <>
                <Button size="sm" onMouseDown={keepFocus} onClick={() => !copyAndLeave(phase.text) && utools.showNotification('复制失败')}>
                  复制
                </Button>
                <Button size="sm" variant="outline" onMouseDown={keepFocus} onClick={() => pasteBack(phase.text)}>
                  粘回
                </Button>
              </>
            )}
            {current && phase.kind !== 'running' && (
              <Button size="sm" variant="outline" onMouseDown={keepFocus} onClick={() => void start(current, source)}>
                重新运行
              </Button>
            )}
          </div>
          {phase.kind === 'done' && <p className="text-xs text-muted-foreground">回车复制并退出 · Ctrl+回车粘回 · Esc 退出</p>}
        </section>
      )}
    </div>
  )
}
