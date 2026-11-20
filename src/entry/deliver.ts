// 把译文交给用户：粘回原应用，或复制后退出。
// 粘回失败的两种情况（input.md、window.md）：不在主窗口（分离窗口 / 自定义窗口时可能因焦点失败），
// 或 hideMainWindowPasteText 返回 false。两种都改为复制 + 系统通知。
export type PasteOutcome = 'pasted' | 'copied' | 'failed'

interface PasteHost {
  getWindowType(): 'main' | 'detach' | 'custom'
  hideMainWindow(isFocusPrevWindow?: boolean): boolean
  hideMainWindowPasteText(text: string): boolean
  copyText(text: string): boolean
  showNotification(body: string): void
  outPlugin(isKill?: boolean): void
}

const host = (): PasteHost => window.utools

export function pasteBack(text: string, h: PasteHost = host()): PasteOutcome {
  if (text === '') return 'failed'
  if (h.getWindowType() === 'main' && h.hideMainWindowPasteText(text)) return 'pasted'
  return copyInstead(text, h)
}

/** 先隐藏主窗口、把焦点还给原应用，等这么久再粘贴（毫秒）。数值未实测，按真机结果调。 */
export const PASTE_FOCUS_WAIT_MS = 200

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 「翻译并粘回」用：按键处理里直接 hideMainWindowPasteText，粘贴键可能在原应用拿回焦点前就发出，
 * 文本进了剪贴板、原应用没变（2026-11-05 实测 1b）。改为先 hideMainWindow()，等焦点回去再粘贴；
 * 粘贴返回 false（input.md：当前窗口仍有焦点）时再等一次重试，仍失败就复制 + 通知。
 */
export async function pasteBackAfterHide(
  text: string,
  h: PasteHost = host(),
  sleep: (ms: number) => Promise<void> = wait,
): Promise<PasteOutcome> {
  if (text === '') return 'failed'
  if (h.getWindowType() === 'main' && h.hideMainWindow()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(PASTE_FOCUS_WAIT_MS)
      if (h.hideMainWindowPasteText(text)) return 'pasted'
    }
  }
  return copyInstead(text, h)
}

function copyInstead(text: string, h: PasteHost): PasteOutcome {
  if (!h.copyText(text)) {
    h.showNotification('粘回失败，复制也失败了')
    return 'failed'
  }
  h.showNotification('没能粘回原应用，译文已复制，请按 Ctrl+V 粘贴')
  return 'copied'
}

/** Enter：复制并退出到后台。 */
export function copyAndLeave(text: string, h: PasteHost = host()): boolean {
  if (text === '' || !h.copyText(text)) return false
  h.outPlugin()
  return true
}
