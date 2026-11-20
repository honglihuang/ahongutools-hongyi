// 入口层共享契约（第二阶段）。实现方见各条注释；改动这个文件 = 改共享接口，必须先停下报告 advisor。

/** plugin.json 的 feature.code。plugin.json 由 P1 维护，必须与此一致。 */
export const FEATURE_CODES = {
  translate: 'translate', // 功能指令「翻译」+ over 匹配 + mainPush：主界面多引擎
  paste: 'translate-paste', // over 匹配「翻译并粘回」：精简预览窗，回车粘回
  shot: 'translate-shot', // 功能指令「截图翻译」+ img 匹配
  file: 'translate-file', // files 匹配 txt/md/srt
  settings: 'settings', // 功能指令「洪译设置」
  probe: 'probe', // 功能指令「洪译实测」（开发期，上架前删除）
  actions: 'actions', // 功能指令「AI 动作」+ over 匹配：打开动作视图（第三阶段 A）
  vocab: 'vocab', // 功能指令「生词本」：本机生词列表（第三阶段第二批）
} as const

/** 自定义动作用 utools.setFeature 注册的动态 feature.code 为 `hongyi-action-<uuid>`，进入后打开动作视图；插件只增删带这个前缀的 code。 */
export const ACTION_FEATURE_PREFIX = 'hongyi-action-'

export type ViewId = 'hub' | 'paste' | 'shot' | 'file' | 'settings' | 'probe' | 'action' | 'vocab'

/** 与 uTools onPluginEnter 的 PluginEnterAction 同形（events.md）。 */
export interface EnterAction {
  code: string
  type: 'text' | 'img' | 'files' | 'regex' | 'over' | 'window'
  payload: unknown
  from: 'main' | 'panel' | 'hotkey' | 'redirect'
  option?: { text?: string }
}

/** 每个视图是一个默认导出的 React 组件，接收进入时的 action（从设置页内跳转时 action 可能为 undefined）。 */
export interface ViewProps {
  action?: EnterAction
}
// 视图文件位置（默认导出）：
//   hub、paste  → src/entry/views/hub.tsx、paste.tsx（P1）
//   settings    → src/settings/index.tsx（P2）
//   shot、file  → src/media/shot.tsx、file.tsx（P3）
//   probe       → src/probe/index.tsx（P5）
//   action      → src/actions/view.tsx（第三阶段 A）
//   vocab       → src/vocab/view.tsx（第三阶段第二批）

/** 实现在 src/entry/nav.ts（P1）：切换当前视图，不重新进入插件。 */
export type OpenView = (view: ViewId, action?: EnterAction) => void

/** 实现在 src/entry/translate.ts（P1）：不依赖 React 的单次翻译，按当前配置的默认引擎和方向规则。 */
export interface TranslateOnceOptions {
  /** ISO 639-3；不传则按 resolveTargetLang + HongyiPrefs.direction 决定 */
  target?: string
  /** 不传则用配置里的默认翻译 provider */
  providerId?: string
  signal?: AbortSignal
}
/** 洪译自己的偏好，存 utools.dbStorage 键 'hongyi.prefs'（同步）。读写实现在 src/entry/prefs.ts（P1），设置页（P2）用它。 */
export interface HongyiPrefs {
  direction: { native: string; foreign: string } // 默认 { native: 'cmn', foreign: 'eng' }
  /** 搜索框直出：'smart' = 只在检测到非母语或以 prefix 开头时推送；'any' = 任意文本；'off' = 关闭 */
  mainPush: { mode: 'smart' | 'any' | 'off'; prefix: string } // 默认 { mode: 'smart', prefix: 'fy ' }
  /** 翻译并粘回的目标语言，默认 'eng' */
  pasteTarget: string
  /** 历史记录是否开启，默认 true；历史存 window.services.localStore 键 'history'（本机） */
  history: boolean
}
export const PREFS_KEY = 'hongyi.prefs'

/** 实现在 src/entry/prefs.ts（P1）。 */
export type GetPrefs = () => HongyiPrefs
export type SetPrefs = (patch: Partial<HongyiPrefs>) => void

export type TranslateOnce = (
  text: string,
  opts?: TranslateOnceOptions,
) => Promise<{ text: string; providerId: string; target: string }>
