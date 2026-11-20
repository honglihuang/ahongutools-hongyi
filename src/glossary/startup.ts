// 术语表（第三阶段 G）启动时与同步拉取后的处理，由 main.tsx 调用。
// 1) 上游匹配器的快照 loader 改为读本机术语表（./repository.ts，存 localStore；url 恒为 undefined），主界面卡片、translateOnce 都经它取术语。
// 2) 搜索框直出缓存按翻译上下文指纹失效：配置（术语表开关、当前提示词）或术语表一改，300 ms 后重算并交给 setContext。
//    配置写入与仓库写入都经 `#imports` storage（shims/wxt-imports/storage.ts）触发 watch；同步拉取不触发 watch，由 onDbPull 补上。
import { storage } from '#imports'
import { getLocalConfig } from '@/utils/config/storage'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from '@/utils/constants/config'
import { GLOSSARY_REVISION_KEY } from '@/utils/constants/glossary'
import { setGlossarySnapshotLoader } from '@/utils/glossary/active-matcher'
import { mainPushApi } from '../entry/main-push-api.ts'
import { activePrompt } from '../entry/translate-core.ts'
import { promptCatalog } from '../entry/translate.ts'
import { contextFingerprint } from './fingerprint.ts'
import { EMPTY_SNAPSHOT, readFingerprintRows, readSnapshot } from './snapshot.ts'

const DEBOUNCE_MS = 300

/** 当前翻译上下文的指纹。术语表读不出来时按「没有术语」算（与 translateOnce 的降级一致）。 */
export async function computeContext(): Promise<string> {
  const config = (await getLocalConfig()) ?? DEFAULT_CONFIG
  const prompt = activePrompt(config, promptCatalog)
  let rows: Awaited<ReturnType<typeof readFingerprintRows>> = { glossaries: [], terms: [] }
  let termsUnavailable = false
  if (config.glossary.enabled) {
    try {
      rows = await readFingerprintRows()
    } catch (error) {
      console.warn('[hongyi] 读取术语表失败，搜索框缓存按无术语计算', error)
      termsUnavailable = true
    }
  }
  return contextFingerprint({ enabled: config.glossary.enabled, ...rows, termsUnavailable, prompt })
}

let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> = Promise.resolve()

/** 立即重算并交给搜索框缓存；串行执行，后一次总在前一次之后落定。 */
export function refreshContext(): Promise<void> {
  running = running.then(async () => {
    const api = mainPushApi()
    if (!api) return
    api.setContext(await computeContext())
  }).catch((error: unknown) => console.warn('[hongyi] 更新搜索框缓存指纹失败', error))
  return running
}

function scheduleRefresh(): void {
  clearTimeout(timer)
  timer = setTimeout(() => void refreshContext(), DEBOUNCE_MS)
}

let started = false

export async function start(): Promise<void> {
  // 先于任何 await：首次渲染前 loader 就位，主界面卡片的第一次匹配就读本机术语表。
  setGlossarySnapshotLoader(async (_url, targetLang) => {
    try {
      return await readSnapshot(targetLang)
    } catch (error) {
      console.warn('[hongyi] 读取术语表失败，本次不带术语翻译', error)
      return EMPTY_SNAPSHOT
    }
  })
  if (started) return
  started = true
  storage.watch(`local:${CONFIG_STORAGE_KEY}`, scheduleRefresh)
  storage.watch(GLOSSARY_REVISION_KEY, scheduleRefresh)
  await refreshContext()
}

export async function onDbPull(): Promise<void> {
  await refreshContext()
}
