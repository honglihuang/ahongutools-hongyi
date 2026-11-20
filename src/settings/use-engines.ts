// 引擎列表的读写：上游配置经 writeConfigAtom 写（同一条 configSchema 校验与 secret-guard），key 经 logic.ts 进 secrets。
import type { Config } from '@/types/config/config'
import type { ProviderConfig } from '@/types/config/provider'
import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useEffect, useState } from 'react'
import { configFieldsAtomMap, writeConfigAtom } from '@/utils/atoms/config'
import {
  computeLanguageDetectionFallbackAfterDeletion,
  computeProviderFallbacksAfterDeletion,
  computeSelectionToolbarCustomActionFallbacksAfterDeletion,
} from '@/utils/config/helpers'
import { buildFeatureProviderPatch } from '@/utils/constants/feature-providers'
// 直接取适配层常量：src/ 下的 import 不经过 vite 的上游整模块替换，不能用上游 useHostedAiStatus。
import { HOSTED_AI_UNAVAILABLE_STATUS } from '../upstream-adapter/hosted-ai-status.ts'
import { UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'
import type { EngineRow } from './logic.ts'
import { forgetEngine, isEngineType, orderEngines } from './logic.ts'

/** 删除一行后要一起改的配置：引用它的功能改指向剩下的第一个可用引擎（与上游设置页删除时同一套 helper）。 */
function deletionPatch(current: Config, id: string): Partial<Config> {
  const remaining = current.providersConfig.filter((p) => p.id !== id)
  const status = HOSTED_AI_UNAVAILABLE_STATUS
  const patch: Partial<Config> = buildFeatureProviderPatch(computeProviderFallbacksAfterDeletion(id, current, remaining, status))
  const detection = computeLanguageDetectionFallbackAfterDeletion(id, current, remaining, status)
  if (detection) patch.languageDetection = { ...current.languageDetection, providerId: detection }
  const toolbar = computeSelectionToolbarCustomActionFallbacksAfterDeletion(id, current, remaining, status)
  if (toolbar) patch.selectionToolbar = toolbar
  return { ...patch, providersConfig: remaining }
}

export function useEngines() {
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const writeConfig = useSetAtom(writeConfigAtom)
  const rows = orderEngines(
    (providersConfig as unknown as EngineRow[]).filter((p) => p.id === UTOOLS_AI_PROVIDER_ID || isEngineType(p.provider)),
  )

  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({})
  const ids = rows.map((r) => r.id).join('\n')
  const refreshKeys = useCallback(async () => {
    const list = ids ? ids.split('\n') : []
    const has = await Promise.all(list.map((id) => window.services.secrets.has(id)))
    setKeyStatus(Object.fromEntries(list.map((id, i) => [id, has[i]!])))
  }, [ids])
  useEffect(() => {
    void refreshKeys()
  }, [refreshKeys])

  /** 写回一行（新增或修改）。row 里的 apiKey 已由 saveEngine 换成占位符。 */
  const putRow = useCallback(
    async (row: EngineRow) => {
      await writeConfig((current) => {
        const list = current.providersConfig
        const exists = list.some((p) => p.id === row.id)
        const next = exists ? list.map((p) => (p.id === row.id ? row : p)) : [...list, row]
        return { providersConfig: next as unknown as ProviderConfig[] }
      })
      await refreshKeys()
    },
    [writeConfig, refreshKeys],
  )

  const removeRow = useCallback(
    async (id: string) => {
      if (id === UTOOLS_AI_PROVIDER_ID) throw new Error('uTools AI 不能删除')
      await writeConfig((current) => deletionPatch(current, id))
      await forgetEngine(window.services, id)
      await refreshKeys()
    },
    [writeConfig, refreshKeys],
  )

  /** 上游 schema 要求全部 provider 名字唯一（含本页不显示的类型）。 */
  const allNames = providersConfig.map((p) => p.name)

  return { rows, allNames, keyStatus, putRow, removeRow }
}
