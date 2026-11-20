// 主界面（决策 M1）：上游 translation hub 的组件，外加 uTools 子输入框、键盘快捷键与方向规则。
// 不改上游组件：只写 atoms、读 MutationCache、在 window 上监听按键。
import { useQueryClient } from '@tanstack/react-query'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import * as React from 'react'
import {
  detectedSourceLangCodeAtom,
  exchangeLangCodesAtom,
  selectedProviderIdsAtom,
  translateRequestAtom,
} from '@/entrypoints/translation-hub/atoms'
import { LanguageControlPanel } from '@/entrypoints/translation-hub/components/language-control-panel'
import { PromptSelector } from '@/entrypoints/translation-hub/components/prompt-selector'
import { TextInput } from '@/entrypoints/translation-hub/components/text-input'
import { TranslationPanelActions } from '@/entrypoints/translation-hub/components/translation-panel-actions'
import { TranslationServiceDropdown } from '@/entrypoints/translation-hub/components/translation-service-dropdown'
import { configFieldsAtomMap } from '@/utils/atoms/config'
import { cn } from '@/utils/styles/utils'
import type { VocabDraft } from '../../vocab/contract.ts'
import AddToVocabButton from '../../vocab/add-button.tsx'
import { canAddToVocab, guessSourceLang } from '../../vocab/logic.ts'
import type { ViewProps } from '../contract.ts'
import { getEngineChoice, resolveDefaultEngine } from '../default-engine.ts'
import { copyAndLeave, pasteBack } from '../deliver.ts'
import { addHistory } from '../history.ts'
import { hubKeyAction, moveSelection } from '../hub-keys.ts'
import { latestResult, onFirstResult } from '../hub-results.ts'
import { mainPushApi } from '../main-push-api.ts'
import { HubCards } from './hub-cards.tsx'
import { useNav } from './view-host.tsx'
import { useHubTranslate } from './use-hub-translate.ts'
import { useSubInput } from './use-sub-input.ts'

/** 进入时带入的原文：over / regex 的 payload；经搜索框直出进入时 onSelect 已把原文放在 payload（over 匹配）。 */
function initialText(action: ViewProps['action']): string {
  if (!action || (action.type !== 'over' && action.type !== 'regex')) return ''
  return typeof action.payload === 'string' ? (mainPushApi()?.sourceOf(action.payload) ?? action.payload) : ''
}

/** 焦点在输入框或打开的下拉 / 菜单里：按键交还给它（上游语言选择、服务下拉用方向键和回车）。 */
const isEditable = (el: Element | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
    el.closest('[role="listbox"],[role="menu"],[role="combobox"],[role="dialog"]') !== null)

/**
 * 每个请求的第一个结果写进历史；搜索框直出缓存只写默认引擎（resolveDefaultEngine）的结果，
 * 与「翻译并粘回」等单引擎入口一致。默认引擎不在当前卡片里时，这次不写缓存。
 */
function useRememberResults() {
  const queryClient = useQueryClient()
  const store = useStore()
  React.useEffect(() => {
    const cache = queryClient.getMutationCache()
    const isDefault = (providerId: string) =>
      resolveDefaultEngine(store.get(configFieldsAtomMap.providersConfig), getEngineChoice())?.id === providerId
    const offs = [
      onFirstResult(cache, (r) => {
        void addHistory({ ...r, at: Date.now() }).catch((e: unknown) => console.warn('写历史失败', e))
      }),
      onFirstResult(
        cache,
        (r) => mainPushApi()?.remember(r.source, { text: r.text, target: r.target, providerId: r.providerId }),
        isDefault,
      ),
    ]
    return () => offs.forEach((off) => off())
  }, [queryClient, store])
}

/**
 * 「加入生词本」的草稿：选中卡片对当前请求的译文；原文 = 这次请求的原文。MutationCache 变化时重新计算。
 * 原文语言选「自动」时取上游检测结果，检测不出为 'und'。
 */
function useVocabDraft(providerId: string | undefined): VocabDraft | null {
  const queryClient = useQueryClient()
  const request = useAtomValue(translateRequestAtom)
  const detected = useAtomValue(detectedSourceLangCodeAtom)
  const cache = queryClient.getMutationCache()
  const meaning = React.useSyncExternalStore(
    React.useCallback((notify) => cache.subscribe(notify), [cache]),
    () => (providerId && request ? latestResult(cache.getAll(), providerId, request.timestamp) : null),
  )
  return React.useMemo(() => {
    if (!request || meaning === null) return null
    const sourceLang = guessSourceLang(request.inputText, request.sourceLanguage === 'auto' ? detected : request.sourceLanguage)
    return { term: request.inputText, meaning, sourceLang, targetLang: request.targetLanguage, from: 'hub' }
  }, [request, meaning, detected])
}

export default function HubView({ action }: ViewProps) {
  const { detached } = useNav()
  const queryClient = useQueryClient()
  const providerIds = useAtomValue(selectedProviderIdsAtom)
  const request = useAtomValue(translateRequestAtom)
  const exchange = useSetAtom(exchangeLangCodesAtom)
  const [selected, setSelected] = React.useState(0)
  const { onText, translateNow } = useHubTranslate()
  const initial = React.useMemo(() => initialText(action), [action])
  const vocabDraft = useVocabDraft(providerIds[selected])
  const showVocab = vocabDraft !== null && canAddToVocab(vocabDraft.term)

  useSubInput(onText, '输入要翻译的文本', initial)
  useRememberResults()
  React.useEffect(() => translateNow(initial), [initial, translateNow])
  React.useEffect(() => setSelected((i) => Math.min(i, Math.max(providerIds.length - 1, 0))), [providerIds.length])

  const current = React.useRef({ providerIds, selected, request })
  current.current = { providerIds, selected, request }

  // 键盘：子输入框有焦点时按键是否送进页面，文档未写（见汇报的实测项）；页面获得焦点时一定能收到。
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const act = hubKeyAction(e, isEditable(document.activeElement))
      if (!act) return
      e.preventDefault()
      const { providerIds: ids, selected: sel, request: req } = current.current
      if (act === 'swap') return void exchange()
      if (act === 'next' || act === 'prev') return setSelected(moveSelection(sel, ids.length, act === 'next' ? 1 : -1))
      const id = ids[sel]
      const text = id && req ? latestResult(queryClient.getMutationCache().getAll(), id, req.timestamp) : null
      if (!text) return
      if (act === 'copy') copyAndLeave(text)
      else pasteBack(text)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exchange, queryClient])

  return (
    <div className={cn('mx-auto w-full px-4 py-4', detached ? 'max-w-6xl' : 'max-w-3xl')}>
      <div className={cn('grid grid-cols-1 gap-4', detached && 'grid-cols-2')}>
        <div className="flex min-w-0 flex-col gap-3">
          <LanguageControlPanel />
          <TextInput />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex max-w-full min-w-0 items-center justify-end gap-2">
            <PromptSelector />
            <TranslationServiceDropdown />
            <TranslationPanelActions />
          </div>
          <HubCards selected={selected} />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              ↑↓ 选卡片 · Enter 复制并关闭 · Ctrl+Enter 粘回 · Ctrl+T 交换语言{showVocab && ' · Ctrl+D 加入生词本'}
            </p>
            <AddToVocabButton draft={vocabDraft} />
          </div>
        </div>
      </div>
    </div>
  )
}
