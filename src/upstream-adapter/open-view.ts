// 上游服务下拉的设置按钮原来用 browser.tabs.create 打开扩展选项页；vite.config.ts 在构建期改成调用这里，
// 派发 OPEN_VIEW_EVENT，由入口层切换到插件内的设置视图。
import { OPEN_VIEW_EVENT } from '../bridge/contract.ts'

export function openSettingsView(): void {
  window.dispatchEvent(new CustomEvent(OPEN_VIEW_EVENT, { detail: 'settings' }))
}
