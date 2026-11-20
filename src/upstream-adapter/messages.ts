// 上游 translation hub 闭包里 sendMessage 用到的 10 个 key（见 upstream/read-frog/src/utils/message.ts）。
// translation hub 用得到的在这里本地实现；其余不注册，sendMessage 会以「not supported in uTools」拒绝（shims/webext-messaging.ts）。
//   已注册：getHostedAiStatus（固定「需要登录」）、trackFeatureUsedEvent（埋点已删，不发送任何数据）、
//           getGlossarySnapshot（本机 localStore 里的术语表，与 src/glossary/startup.ts 设的 loader 同一份数据）、openPage（经 uTools 打开外部链接）。
//   不注册：backgroundFetch、backgroundGenerateText、edgeTtsSynthesize、ttsPlaybackPrepare/Start/Stop。
import { onMessage } from '@/utils/message'
import { EMPTY_SNAPSHOT, readSnapshot } from '../glossary/snapshot.ts'
import { HOSTED_AI_UNAVAILABLE_STATUS } from './hosted-ai-status.ts'

let registered = false

export function registerMessageHandlers(): void {
  if (registered) return
  registered = true

  onMessage('getHostedAiStatus', () => HOSTED_AI_UNAVAILABLE_STATUS)

  // 决策「不进 MVP：埋点」：收下即丢弃，不外发。
  onMessage('trackFeatureUsedEvent', () => undefined)

  // uTools 里没有网页：忽略 data.url，只有网址范围为空的术语表生效。读失败给空表（不带术语翻译），不让翻译失败。
  onMessage('getGlossarySnapshot', async ({ data }) => {
    try {
      return await readSnapshot(data.targetLang)
    } catch (error) {
      console.warn('[hongyi] 读取术语表失败，本次不带术语翻译', error)
      return EMPTY_SNAPSHOT
    }
  })

  onMessage('openPage', async ({ data }) => {
    const url = new URL(data.url)
    if (url.protocol !== 'https:') throw new Error(`refusing to open non-https url: ${url.protocol}`)
    await window.utools.shellOpenExternal(url.href)
  })
}
