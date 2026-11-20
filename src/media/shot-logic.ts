// 截图翻译视图的纯逻辑：按引擎征求同意、提示与结果里的引擎说明。不依赖 uTools 和 DOM，用 node --test 测试。
import { UTOOLS_AI_PROVIDER_ID } from '../upstream-adapter/default-providers.ts'
import type { VisionEngineResult, VisionTarget } from './vision-engine.ts'

/** dbStorage 键（随账号同步）。值是已同意的引擎 id；旧版本存 true，当时提示的是 uTools AI。 */
export const CONSENT_KEY = 'hongyi.shot.consent'

/** 同意按引擎算：存的引擎 id 与这次要发送的引擎不同就要重新确认。 */
export function hasShotConsent(stored: unknown, engineId: string): boolean {
  return stored === engineId || (stored === true && engineId === UTOOLS_AI_PROVIDER_ID)
}

/** 这次能不能识别：只有要用 uTools AI 时才需要它有视觉模型。 */
export function canRecognize(target: VisionTarget, utoolsModel: string): boolean {
  return target.id !== UTOOLS_AI_PROVIDER_ID || utoolsModel !== ''
}

const withModel = (name: string, model: string) => (model ? `「${name}」（模型 ${model}）` : `「${name}」`)

/**
 * 首次使用（或引擎变了）时的提示。utoolsModel：当前所选的 uTools AI 视觉模型（用 uTools AI 时就是它；
 * 用默认引擎时是识别失败后改用的模型），空串 = 没有。
 */
export function consentText(target: VisionTarget, utoolsModel: string): string {
  const isUtools = target.id === UTOOLS_AI_PROVIDER_ID
  const head = target.reason ? `${target.reason}。` : ''
  const main = `截图会发送给${withModel(target.name, isUtools ? utoolsModel : target.model)}进行文字识别和翻译`
  const fallback = !isUtools && utoolsModel ? `；识别失败时会改用${withModel('uTools AI', utoolsModel)}` : ''
  return `${head}${main}${fallback}，不会发送给其他服务。`
}

/** 页头：截图会先发给的引擎（planVisionTarget 的结果）。用 uTools AI 时模型取当前所选的视觉模型。 */
export function plannedLine(target: VisionTarget, utoolsModel: string): string {
  return `识别引擎：${withModel(target.name, target.id === UTOOLS_AI_PROVIDER_ID ? utoolsModel : target.model)}`
}

/** 页头 uTools AI 视觉模型下拉的标签：识别引擎就是 uTools AI 时是它用的模型，否则是默认引擎识别失败后改用的模型。 */
export function fallbackPickerLabel(target: VisionTarget): string {
  return target.id === UTOOLS_AI_PROVIDER_ID ? 'uTools AI 视觉模型' : '识别失败时改用 uTools AI'
}

/** 识别结果下方的说明：实际用的引擎、模型，以及没用上默认引擎的原因。 */
export function engineLine({ engine, fallback }: Pick<VisionEngineResult, 'engine' | 'fallback'>): string {
  return `识别引擎：${withModel(engine.name, engine.model)}${fallback ? `。${fallback}` : ''}`
}
