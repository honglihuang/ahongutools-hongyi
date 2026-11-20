// uTools AI：模型下拉与思考开关。存在上游配置 utools-ai 这一行（model.customModel、providerOptions.reasoningEffort），
// 上游翻译链路与 P1 的 translateOnce 只要按配置调这个 provider 就会带上（见 logic.ts 的说明）。
import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/base-ui/select'
// 上游 Switch 依赖未安装的 motion 包，用 Checkbox 代替。
import { Checkbox } from '@/components/ui/base-ui/checkbox'
import type { UtoolsAiModel } from '../engine/contract.ts'
import { listUtoolsAiModels } from '../engine/utools-ai.ts'
import { UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'
import type { UtoolsAiSettings } from './logic.ts'
import { applyUtoolsAiSettings, readUtoolsAiSettings } from './logic.ts'
import { ConfigItem, errorText, Note } from './ui.tsx'
import { useEngines } from './use-engines.ts'

const DEFAULT_MODEL_VALUE = '__default__'

export function UtoolsAiSection() {
  const { rows, putRow } = useEngines()
  const row = rows.find((r) => r.id === UTOOLS_AI_PROVIDER_ID)
  const settings = readUtoolsAiSettings(row)
  const [models, setModels] = useState<UtoolsAiModel[]>([])
  const [error, setError] = useState<string>()

  useEffect(() => {
    listUtoolsAiModels().then(setModels, (e: unknown) => setError(`读取模型列表失败：${errorText(e)}`))
  }, [])

  const update = (patch: Partial<UtoolsAiSettings>) => {
    if (!row) return
    setError(undefined)
    putRow(applyUtoolsAiSettings(row, { ...settings, ...patch })).catch((e: unknown) => setError(errorText(e)))
  }
  const labelOf = (id: string | undefined) =>
    id === undefined ? 'uTools 默认模型' : (models.find((m) => m.id === id)?.label ?? id)

  return (
    <>
      <Note>使用 uTools AI 会消耗你的 AI 能量。免配置；没有启用自己的引擎时，它就是默认引擎（可在上面的「默认引擎」里改）。</Note>
      {!row && <p className="text-[13px] text-destructive">配置里没有 uTools AI 这一项。</p>}
      <ConfigItem title="模型">
        <Select
          value={settings.model ?? DEFAULT_MODEL_VALUE}
          onValueChange={(v) => update({ model: v === DEFAULT_MODEL_VALUE ? undefined : (v as string) })}
          disabled={!row}
        >
          <SelectTrigger size="sm">
            <SelectValue render={<span />}>{labelOf(settings.model)}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={DEFAULT_MODEL_VALUE}>uTools 默认模型</SelectItem>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ConfigItem>
      <ConfigItem title="思考模式" description="默认关闭：翻译不需要思考，关闭后更快、消耗更少。">
        <Checkbox aria-label="思考模式" checked={settings.thinking} disabled={!row} onCheckedChange={(thinking) => update({ thinking })} />
      </ConfigItem>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </>
  )
}
