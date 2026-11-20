// 洪译自己的偏好（HongyiPrefs，存 utools.dbStorage 'hongyi.prefs'）：语言方向、搜索框直出、历史记录。
// pasteTarget 仍在契约类型里，但「翻译并粘回」已改为按语言方向自动互译（决策 L9），设置页不再显示它。
import type { LangCodeISO6393 } from '@read-frog/definitions'
import { useState } from 'react'
import { LanguageCombobox } from '@/components/language-combobox'
import { Button } from '@/components/ui/base-ui/button'
import { Input } from '@/components/ui/base-ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/base-ui/select'
// 上游 Switch 依赖未安装的 motion 包，用 Checkbox 代替。
import { Checkbox } from '@/components/ui/base-ui/checkbox'
import type { HongyiPrefs } from '../entry/contract.ts'
import { getPrefs, setPrefs } from '../entry/prefs.ts'
import { ConfigItem, ConfigSection, errorText, Note } from './ui.tsx'

export function usePrefs() {
  const [prefs, setState] = useState(getPrefs)
  const update = (patch: Partial<HongyiPrefs>) => {
    setPrefs(patch)
    setState(getPrefs())
  }
  return [prefs, update] as const
}

function LangPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <LanguageCombobox
      triggerSize="sm"
      className="text-sm"
      value={value as LangCodeISO6393}
      onValueChange={(code) => {
        if (code !== 'auto') onChange(code)
      }}
    />
  )
}

const MAIN_PUSH_LABELS: Record<HongyiPrefs['mainPush']['mode'], string> = {
  smart: '智能：非母语文本或带前缀时',
  any: '任意文本',
  off: '关闭',
}

export function PrefsSections() {
  const [prefs, update] = usePrefs()
  const [prefixDraft, setPrefixDraft] = useState(prefs.mainPush.prefix)
  const [historyMessage, setHistoryMessage] = useState<string>()

  const clearHistory = async () => {
    setHistoryMessage(undefined)
    try {
      await window.services.localStore.remove('history')
      setHistoryMessage('历史记录已清空')
    } catch (e) {
      setHistoryMessage(`清空失败：${errorText(e)}`)
    }
  }

  return (
    <>
      <ConfigSection title="语言方向">
        <Note>
          规则：检测到的语言不是母语 → 译成母语；是母语 → 译成常用外语；检测不出 → 译成母语。主界面、「翻译并粘回」「截图翻译」都按这个规则。
        </Note>
        <ConfigItem title="母语">
          <LangPicker value={prefs.direction.native} onChange={(native) => update({ direction: { ...prefs.direction, native } })} />
        </ConfigItem>
        <ConfigItem title="常用外语">
          <LangPicker value={prefs.direction.foreign} onChange={(foreign) => update({ direction: { ...prefs.direction, foreign } })} />
        </ConfigItem>
      </ConfigSection>

      <ConfigSection title="搜索框直出">
        <ConfigItem title="何时在 uTools 搜索框下直接显示译文" description="智能模式下，以前缀开头的文本总会翻译（前缀本身不翻译）。">
          <Select
            value={prefs.mainPush.mode}
            onValueChange={(mode) => update({ mainPush: { ...prefs.mainPush, mode: mode as HongyiPrefs['mainPush']['mode'] } })}
          >
            <SelectTrigger size="sm">
              <SelectValue render={<span />}>{MAIN_PUSH_LABELS[prefs.mainPush.mode]}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {(Object.keys(MAIN_PUSH_LABELS) as HongyiPrefs['mainPush']['mode'][]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {MAIN_PUSH_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ConfigItem>
        <ConfigItem title="前缀" description="留空表示不用前缀；注意末尾空格也算前缀的一部分。">
          <Input
            className="w-32"
            value={prefixDraft}
            onChange={(e) => setPrefixDraft(e.target.value)}
            onBlur={() => update({ mainPush: { ...prefs.mainPush, prefix: prefixDraft } })}
          />
        </ConfigItem>
      </ConfigSection>

      <ConfigSection title="历史记录">
        <ConfigItem title="记录翻译历史" description="历史只存本机，不随 uTools 同步。">
          <Checkbox aria-label="记录翻译历史" checked={prefs.history} onCheckedChange={(history) => update({ history })} />
        </ConfigItem>
        <ConfigItem title="清空历史">
          <Button size="sm" variant="destructive" onClick={() => void clearHistory()}>
            清空
          </Button>
          {historyMessage && <span className="mt-1 text-xs text-muted-foreground">{historyMessage}</span>}
        </ConfigItem>
      </ConfigSection>
    </>
  )
}
