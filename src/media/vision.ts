// 截图识别 + 翻译：一次 utools.ai 视觉调用，返回原文与译文。
//
// 为什么不用 src/engine 的 utoolsAiGenerate：它的消息 content 只接受 string（engine/contract.ts）。
// 视觉输入要把图片放进 content 数组：[{ type: 'text' }, { type: 'image_url', image_url: { url } }]，
// 这是 uTools 文档 ai.md「allAiModels 示例」的写法；但同一文档的 Message 类型定义与 utools-api-types 的 d.ts
// 都写 content?: string，文档内部就矛盾。这里按示例写法发，类型在本文件内自定义。是否真能用待实测 T-14；
// 图片大小上限待实测 T-15。
import { listUtoolsAiModels } from '../engine/utools-ai.ts'
import type { DirectionPrefs, UtoolsAiModel } from '../engine/contract.ts'
import { langName } from './lang.ts'

type VisionContent = Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>

interface VisionAiOptions {
  model: string
  messages: Array<{ role: 'user'; content: VisionContent }>
  reasoning_effort?: 'none'
}

interface AiPromise<T> extends Promise<T> {
  abort(): void
}

interface VisionUtools {
  ai(options: VisionAiOptions): AiPromise<{ content?: string }>
}

export async function listVisionModels(): Promise<UtoolsAiModel[]> {
  return (await listUtoolsAiModels()).filter((m) => m.vision)
}

export interface VisionResult {
  source: string
  translation: string
  /** 回复不是约定的 JSON，整段回复当译文显示。 */
  raw: boolean
}

/** 方向规则同 resolveTargetLang：原文是母语 → 译成常用外语；否则 → 译成母语。识别前不知道原文语言，所以写进提示词。 */
export function visionPrompt({ native, foreign }: DirectionPrefs): string {
  return (
    `识别图片中的全部文字并翻译：原文是${langName(native)}时译成${langName(foreign)}，否则译成${langName(native)}。` +
    '只输出一个 JSON 对象，不要代码块、不要其他文字：' +
    '{ "source": "识别出的原文", "translation": "译文" }。' +
    '原文与译文都按段落整理：同一段里因屏幕宽度产生的折行要合并成一行，段落之间空一行，列表项各占一行。' +
    '图中没有文字时两个字段都给空字符串。'
  )
}

/** 解析模型回复：允许外面包一层 ```json 代码块或前后有说明文字；解析不出就整段当译文。 */
export function parseVisionReply(reply: string): VisionResult {
  const trimmed = reply.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  const body = fenced ? fenced[1] : trimmed
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>
      if (typeof obj.source === 'string' && typeof obj.translation === 'string') {
        return { source: obj.source, translation: obj.translation, raw: false }
      }
    } catch {
      // 落到下面：整段当译文。
    }
  }
  return { source: '', translation: trimmed, raw: true }
}

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/** 把截图（Data URL）发给指定的视觉模型，按 direction 识别并翻译。中止时以 AbortError 拒绝。 */
export async function recognizeAndTranslate(
  imageDataUrl: string,
  { model, direction, signal }: { model: string; direction: DirectionPrefs; signal?: AbortSignal },
): Promise<VisionResult> {
  if (signal?.aborted) throw abortError()
  // 全局 utools 的 d.ts 类型里 content 只能是 string，这里换成本文件的视觉类型（见文件头注释）。
  const api = (globalThis as unknown as { utools?: VisionUtools }).utools
  if (!api) throw new Error('utools API is not available')
  const call = api.ai({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: visionPrompt(direction) },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    reasoning_effort: 'none',
  })
  const result = await new Promise<{ content?: string }>((resolve, reject) => {
    const onAbort = () => {
      call.abort()
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    call.then(
      (r) => (signal?.removeEventListener('abort', onAbort), resolve(r)),
      (e: unknown) => (signal?.removeEventListener('abort', onAbort), reject(e)),
    )
  })
  return parseVisionReply(result?.content ?? '')
}
