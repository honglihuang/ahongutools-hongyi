// 当前视图的外壳：订阅 nav 状态，按 registry 惰性加载视图组件；文件不存在时显示「建设中」。
// 视图在插件退出（view 为 null）或重新进入（seq 变化）时卸载，组件内的在途请求随卸载取消。
import type { ComponentType } from 'react'
import * as React from 'react'
import type { ViewId, ViewProps } from '../contract.ts'
import { getNavState, subscribeNav } from '../nav.ts'
import { viewLoader } from './registry.ts'

const lazyCache = new Map<ViewId, ComponentType<ViewProps>>()

function UnderConstruction() {
  return <p className="p-6 text-sm text-muted-foreground">建设中</p>
}

function componentFor(view: ViewId): ComponentType<ViewProps> {
  let C = lazyCache.get(view)
  if (!C) {
    const load = viewLoader(view)
    C = load ? React.lazy(load) : UnderConstruction
    lazyCache.set(view, C)
  }
  return C
}

export function useNav() {
  return React.useSyncExternalStore(subscribeNav, getNavState)
}

// 没有这一层时，视图渲染或惰性加载抛错会卸载整棵 React 树，页面整片空白（2026-11-09 实测「翻译并粘回」）。
class ViewErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  state = { error: undefined as unknown }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  render() {
    if (this.state.error === undefined) return this.props.children
    const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
    return <p className="p-6 text-sm text-destructive break-words">页面出错：{message}</p>
  }
}

export function ViewHost() {
  const { view, action, seq } = useNav()
  if (!view) return null
  const View = componentFor(view)
  return (
    <ViewErrorBoundary key={seq}>
      <React.Suspense fallback={<p className="p-6 text-sm text-muted-foreground">加载中…</p>}>
        <View key={seq} action={action} />
      </React.Suspense>
    </ViewErrorBoundary>
  )
}
