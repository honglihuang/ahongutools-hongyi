// `#imports` 的 browser：只实现 translation hub 闭包实际调用的成员，其余访问明确抛错。
// 调用点见 UPSTREAM 检查：provider-icon（runtime.getURL）、locale-map（i18n.getUILanguage）、
// utils.ts（runtime.id、tabs.query）、translation-service-dropdown（tabs.create，已被构建期补丁去掉）、port-streaming（runtime.connect）。

function unsupported(name: string): never {
  throw new Error(`browser.${name} is not supported in uTools`)
}

function strictNamespace<T extends object>(name: string, members: T): T {
  return new Proxy(members, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop in target) return Reflect.get(target, prop, receiver)
      return unsupported(`${name}.${prop}`)
    },
  })
}

export const browser = strictNamespace('', {
  runtime: strictNamespace('runtime', {
    id: 'hongyi-utools',
    getURL: (path: string) => new URL(path.replace(/^\//, ''), document.baseURI).href,
    connect: (): never => unsupported('runtime.connect'),
  }),
  i18n: strictNamespace('i18n', {
    getUILanguage: () => navigator.language,
  }),
  tabs: strictNamespace('tabs', {
    // 服务下拉的设置按钮已在构建期改为派发 OPEN_VIEW_EVENT（vite.config.ts），这里不再有调用方。
    create: async (): Promise<never> => unsupported('tabs.create'),
    query: async (): Promise<never> => unsupported('tabs.query'),
  }),
})
