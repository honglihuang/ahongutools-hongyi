// 主界面「边输边翻」：写上游 inputTextAtom，按方向规则设目标语言，再写 translateRequestAtom 让上游卡片发请求。
// 方向（竞品报告 5.5）：每次进入把源语言重置为 auto；之后 detectLanguage（franc，不调用 LLM）+ resolveTargetLang。
// 本次会话里用户手动改了源/目标语言（含 Ctrl+T 交换）：不再自动改方向，并按新语言重翻当前原文。
import { useSetAtom, useStore } from 'jotai'
import * as React from 'react'
import { inputTextAtom, sourceLangCodeAtom, targetLangCodeAtom, translateRequestAtom } from '@/entrypoints/translation-hub/atoms'
import { getHubPromptConfig } from '@/entrypoints/translation-hub/prompt'
import { configFieldsAtomMap } from '@/utils/atoms/config'
import { DEFAULT_TRANSLATE_PROMPT_ID } from '@/utils/constants/prompt'
import { detectLanguage } from '@/utils/content/language'
import { resolveTargetLang } from '../../engine/direction.ts'
import { getPrefs } from '../prefs.ts'

const DEBOUNCE_MS = 400
type Lang = Parameters<typeof targetLangCodeAtom.write>[2]

export function useHubTranslate() {
  const store = useStore()
  const setInput = useSetAtom(inputTextAtom)
  const setRequest = useSetAtom(translateRequestAtom)
  const manual = React.useRef(false)
  const applying = React.useRef(false)
  const lastSent = React.useRef('')
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const seq = React.useRef(0)

  const send = React.useCallback(async (text: string) => {
    const my = ++seq.current
    lastSent.current = text
    let lang = store.get(targetLangCodeAtom)
    if (!manual.current && store.get(sourceLangCodeAtom) === 'auto') {
      const detected = await detectLanguage(text, { minLength: 1, enableLLM: false })
      if (my !== seq.current) return
      lang = resolveTargetLang(detected ?? undefined, getPrefs().direction) as Lang
      applying.current = true
      if (lang !== store.get(targetLangCodeAtom)) void store.set(targetLangCodeAtom, lang)
      applying.current = false
    }
    const hub = store.get(configFieldsAtomMap.translationHub)
    const page = store.get(configFieldsAtomMap.pageTranslation)
    setRequest({
      inputText: text,
      sourceLanguage: store.get(sourceLangCodeAtom),
      targetLanguage: lang,
      timestamp: Date.now(),
      promptConfig: getHubPromptConfig(
        hub.promptId ?? page.customPromptsConfig.promptId ?? DEFAULT_TRANSLATE_PROMPT_ID,
        page.customPromptsConfig,
      ),
    })
  }, [store, setRequest])

  React.useEffect(() => {
    applying.current = true
    if (store.get(sourceLangCodeAtom) !== 'auto') void store.set(sourceLangCodeAtom, 'auto')
    applying.current = false
    // 不是我们自己写的语言变化 = 用户手动选择：之后不再自动改方向，按新语言重翻。
    const onUserChange = () => {
      if (applying.current) return
      manual.current = true
      // 交换语言一次改两个 atom：合并成一次重翻。
      clearTimeout(timer.current)
      if (lastSent.current.trim() !== '') timer.current = setTimeout(() => void send(lastSent.current), 0)
    }
    const offs = [store.sub(sourceLangCodeAtom, onUserChange), store.sub(targetLangCodeAtom, onUserChange)]
    return () => {
      offs.forEach((off) => off())
      clearTimeout(timer.current)
    }
  }, [store, send])

  /** 子输入框文本变化：写原文，去抖后翻译；清空时作废待发请求。 */
  const onText = React.useCallback((text: string) => {
    setInput(text)
    clearTimeout(timer.current)
    if (text.trim() === '') {
      seq.current++
      lastSent.current = ''
      return
    }
    timer.current = setTimeout(() => void send(text), DEBOUNCE_MS)
  }, [setInput, send])

  /** 进入时带入的原文：立即翻译，不等去抖（setSubInputValue 是否触发 onChange 未知，T-4）。 */
  const translateNow = React.useCallback((text: string) => {
    setInput(text)
    clearTimeout(timer.current)
    if (text.trim() !== '') void send(text)
  }, [setInput, send])

  return { onText, translateNow }
}
