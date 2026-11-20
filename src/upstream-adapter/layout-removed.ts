// @read-frog/layout-engine 是专有许可（决策 L1），不打包也不做空实现。
// 上游 DEFAULT_CONFIG 所在模块静态引用它；vite.config.ts 在构建期把这些引用改成调用下面的函数，
// 任何需要自定义动作布局的路径都会明确失败，而不是拿到一个空布局。
export class LayoutEngineRemovedError extends Error {
  constructor(what: string) {
    super(`${what} needs the Read Frog layout engine, which is not distributed in uTools`)
    this.name = 'LayoutEngineRemovedError'
  }
}

export function layoutEngineRemoved(): never {
  throw new LayoutEngineRemovedError('custom action layout')
}
