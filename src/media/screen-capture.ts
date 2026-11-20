// utools.screenCapture 包装成 Promise<string>。
// uTools 7.8.0 运行时（apisdk.js）的 screenCapture 只认回调、返回 undefined，`await utools.screenCapture()` 拿到的是 undefined；
// 新版运行时可能返回 Promise，返回 thenable 时也接上。7.8.0 下用户取消截图可能永远不调回调，调用方不能只靠这个 Promise 解除界面等待。

type ScreenCapture = (callback: (image: string) => void) => PromiseLike<string> | undefined

export function captureScreen(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const returned = (utools.screenCapture as ScreenCapture)(resolve)
    if (typeof returned?.then === 'function') returned.then(resolve, reject)
  })
}
