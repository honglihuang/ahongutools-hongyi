// 主界面快捷键 → 动作（纯函数，便于测试）。上下键切卡片，Enter 复制并退出，Ctrl+Enter 粘回，Ctrl+T 交换语言。
export type HubKeyAction = 'copy' | 'paste' | 'next' | 'prev' | 'swap'

export interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  isComposing?: boolean
}

/**
 * inField：焦点在页面里的可编辑元素（上游原文 textarea、语言搜索框等）。这时 Enter / Ctrl+Enter / 方向键交还给该元素：
 * 上游 textarea 里 Ctrl+Enter 是「翻译」，不能同时触发粘回。子输入框（uTools 搜索框）不属于页面元素。
 */
export function hubKeyAction(e: KeyLike, inField: boolean): HubKeyAction | null {
  if (e.isComposing || e.altKey || e.shiftKey) return null
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 't') return 'swap'
  if (inField) return null
  if (e.key === 'Enter') return mod ? 'paste' : 'copy'
  if (mod) return null
  if (e.key === 'ArrowDown') return 'next'
  if (e.key === 'ArrowUp') return 'prev'
  return null
}

/** 选中卡片下标在 [0, count) 里循环移动。 */
export function moveSelection(index: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return 0
  return (((index + delta) % count) + count) % count
}
