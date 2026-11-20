// 设置页的术语表数据：调 ./repository.ts（本机 localStore）。每次写入后重读；出错（读写文件失败、数据格式不对）把原因交给界面显示。
import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../settings/ui.tsx'
import type { Glossary, GlossaryTerm } from './repository.ts'
import { countGlossaryTermsByGlossary, listGlossaries, listGlossaryTerms } from './repository.ts'

export function useGlossaries() {
  const [glossaries, setGlossaries] = useState<Glossary[]>()
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string>()

  const reload = useCallback(async () => {
    try {
      const [list, byGlossary] = await Promise.all([listGlossaries(), countGlossaryTermsByGlossary()])
      setGlossaries(list)
      setCounts(byGlossary)
      setError(undefined)
    } catch (e) {
      setError(`读取术语表失败：${errorText(e)}`)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  /** 跑一次写入，成功失败都重读；失败返回错误文本。 */
  const run = useCallback(
    async (task: () => Promise<unknown>): Promise<string | undefined> => {
      try {
        await task()
        return undefined
      } catch (e) {
        return errorText(e)
      } finally {
        await reload()
      }
    },
    [reload],
  )

  return { glossaries, counts, error, reload, run }
}

export function useTerms(glossaryId: string, version: unknown) {
  const [terms, setTerms] = useState<GlossaryTerm[]>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let live = true
    listGlossaryTerms(glossaryId).then(
      (list) => live && (setTerms(list), setError(undefined)),
      (e: unknown) => live && setError(`读取术语失败：${errorText(e)}`),
    )
    return () => {
      live = false
    }
  }, [glossaryId, version])
  return { terms, error }
}
