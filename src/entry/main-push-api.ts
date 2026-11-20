// 渲染层看到的搜索框直出缓存接口：由 public/preload/main-push.js 实现，preload.js 挂到 window.hongyiMainPush。
// 不放进 window.services（HongyiServices 是共享契约，且由 public/preload/index.js 组装冻结）。
export interface MainPushCacheEntry {
  text: string
  target: string
  providerId: string
}

export interface HongyiMainPushApi {
  /** 主界面翻译完成后写入「原文 → 首个结果」；内存 LRU（上限 500）并异步落盘。 */
  remember(source: string, entry: MainPushCacheEntry): void
  /** 翻译上下文指纹（术语表 + 当前提示词，见 src/glossary/startup.ts）；与已存的不同就清空全部缓存并落盘。 */
  setContext(ctx: string): void
  /** 搜索框文本 → 原文：smart 模式下去掉前缀、去首尾空白（与 callback 查缓存用同一规则）。 */
  sourceOf(text: string): string
}

declare global {
  interface Window {
    hongyiMainPush?: HongyiMainPushApi
  }
}

export const mainPushApi = (): HongyiMainPushApi | undefined => window.hongyiMainPush
