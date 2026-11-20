// 替换 upstream/read-frog/src/utils/layout-host/slots.ts（按解析后的绝对路径）。
// 原模块用 @read-frog/layout-engine/presets 生成内置动作卡片；这里每个布局构建函数都明确抛错。
// translation hub 不调用它们（只有 createDefault*Action 与选项页模板会调用）。
import { LayoutEngineRemovedError } from '../src/upstream-adapter/layout-removed.ts'

export function buildDictionaryActionLayout(): never {
  throw new LayoutEngineRemovedError('dictionary action layout')
}

export function buildSentenceAnalysisActionLayout(): never {
  throw new LayoutEngineRemovedError('sentence analysis action layout')
}

export function buildImproveWritingActionLayout(): never {
  throw new LayoutEngineRemovedError('improve writing action layout')
}
