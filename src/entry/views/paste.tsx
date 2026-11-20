// 「翻译并粘回」预览窗（决策 M3'）：原文 + 单引擎译文，回车粘回，Esc 取消，Ctrl+C 复制。
import { useAtomValue } from 'jotai'
import * as React from 'react'
import { configFieldsAtomMap } from '@/utils/atoms/config'
import type { ViewProps } from '../contract.ts'
import { addHistory } from '../history.ts'
import { mainPushApi } from '../main-push-api.ts'
import { confirmPaste, type PasteState, pasteEngineLine, translateForPaste } from '../paste-flow.ts'
import { translateOnce } from '../translate.ts'

const sourceOf = (action: ViewProps['action']) =>
  action && typeof action.payload === 'string' && (action.type === 'over' || action.type === 'regex') ? action.payload : ''

export default function PasteView({ action }: ViewProps) {
  const source = React.useMemo(() => sourceOf(action), [action])
  const [state, setState] = React.useState<PasteState>({ kind: 'translating' })
  const stateRef = React.useRef(state)
  stateRef.current = state
  const providers = useAtomValue(configFieldsAtomMap.providersConfig)

  React.useEffect(() => {
    const ac = new AbortController()
    void translateForPaste(source, translateOnce, ac.signal).then((next) => {
      if (ac.signal.aborted) return
      setState(next)
      if (next.kind === 'ready') {
        const entry = { text: next.text, target: next.target, providerId: next.providerId }
        mainPushApi()?.remember(source, entry)
        void addHistory({ source, ...entry, at: Date.now() }).catch((e: unknown) => console.warn('写历史失败', e))
      }
    })
    // 退出插件（视图卸载）时取消在途请求。
    return () => ac.abort()
  }, [source])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const cur = stateRef.current
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (cur.kind !== 'ready') return
        // 粘回要等焦点回到原应用；先改 ref，重新渲染前再按回车也不会粘第二次。
        const pasting: PasteState = { kind: 'pasting' }
        stateRef.current = pasting
        setState(pasting)
        void confirmPaste(cur).then(setState)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        utools.outPlugin()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && cur.kind === 'ready') {
        // 页面里有选中文字时交给系统复制选区。
        if (window.getSelection()?.toString()) return
        e.preventDefault()
        if (utools.copyText(cur.text)) utools.outPlugin()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex flex-col gap-3 p-4">
      <section>
        <h2 className="mb-1 text-xs text-muted-foreground">原文</h2>
        <p className="max-h-32 overflow-auto text-sm whitespace-pre-wrap break-words">{source}</p>
      </section>
      <section className="rounded-xl border bg-card p-3">
        {state.kind === 'translating' && <p className="text-sm text-muted-foreground">翻译中…</p>}
        {state.kind === 'error' && <p className="text-sm text-destructive break-words">翻译失败：{state.message}</p>}
        {state.kind === 'pasting' && <p className="text-sm text-muted-foreground">正在粘回…</p>}
        {state.kind === 'ready' && (
          <>
            <p className="text-base whitespace-pre-wrap break-words">{state.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">{pasteEngineLine(providers, state.providerId)}</p>
          </>
        )}
        {state.kind === 'done' && (
          <p className="text-sm text-muted-foreground">{state.outcome === 'failed' ? '粘回和复制都失败了' : '已处理'}</p>
        )}
      </section>
      <p className="text-xs text-muted-foreground">回车粘回 · Esc 取消 · Ctrl+C 复制</p>
    </div>
  )
}
