// 视图 → 组件。路径取自 src/entry/contract.ts 的注释。用 import.meta.glob 惰性查找：
// 文件不存在时 glob 结果里没有这一项，视图显示「建设中」，构建不会因为缺文件失败。
import type { ComponentType } from 'react'
import type { ViewId, ViewProps } from '../contract.ts'

type Loader = () => Promise<{ default: ComponentType<ViewProps> }>

// glob 参数必须是字面量（Vite 在构建期展开）。
const found: Record<string, Loader> = {
  ...import.meta.glob<{ default: ComponentType<ViewProps> }>(['./hub.tsx', './paste.tsx']),
  ...import.meta.glob<{ default: ComponentType<ViewProps> }>([
    '../../settings/index.tsx',
    '../../media/shot.tsx',
    '../../media/file.tsx',
    '../../actions/view.tsx',
    '../../vocab/view.tsx',
  ]),
  // 洪译实测只给开发用：发布构建（VITE_HONGYI_RELEASE=1）下整段摇掉，probe 代码不进 dist。
  ...(import.meta.env.VITE_HONGYI_RELEASE === '1'
    ? {}
    : import.meta.glob<{ default: ComponentType<ViewProps> }>(['../../probe/index.tsx'])),
}

export const VIEW_PATHS: Record<ViewId, string> = {
  hub: './hub.tsx',
  paste: './paste.tsx',
  settings: '../../settings/index.tsx',
  shot: '../../media/shot.tsx',
  file: '../../media/file.tsx',
  probe: '../../probe/index.tsx',
  action: '../../actions/view.tsx',
  vocab: '../../vocab/view.tsx',
}

/** 找不到视图文件时返回 undefined（由外壳显示「建设中」）。 */
export function viewLoader(view: ViewId): Loader | undefined {
  return found[VIEW_PATHS[view]]
}
