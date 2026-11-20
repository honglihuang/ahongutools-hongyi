// uTools 子输入框（window.md setSubInput）：文本变化回调 onChange；视图卸载时移除。
// setSubInputValue 是否触发 onChange 文档未写（T-4），调用方首轮翻译自己发起，不依赖回调。
import * as React from 'react'

export function useSubInput(onChange: (text: string) => void, placeholder: string, initial: string): void {
  const latest = React.useRef(onChange)
  latest.current = onChange
  React.useEffect(() => {
    const ok = utools.setSubInput(({ text }) => latest.current(text), placeholder, true)
    if (ok && initial !== '') utools.setSubInputValue(initial)
    return () => {
      utools.removeSubInput()
    }
    // 只在挂载时设置一次；新的一次进入由 ViewHost 重新挂载视图。
    // oxlint-disable-next-line react/exhaustive-deps
  }, [])
}
