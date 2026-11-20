// 截图识别出的文字带着屏幕上的折行（一句话被拆成几行）。翻译前把段落内的软换行合并：
// - 空行分隔的段落保留（多个空行压成一个）；
// - 明显的列表项（- * • · 开头，或 1. 1) 1、 (1) a. a) 这类编号）另起一行；
// - 合并时：两边有一边是中日韩字符或全角标点 → 直接相连；英文行尾「字母-」接小写字母 → 去掉连字符相连；其他 → 加一个空格。
// 纯函数，不依赖 DOM，用 node --test 测试。

const LIST_ITEM = /^\s*(?:[-*•·▪◦]\s|(?:\d{1,3}|[a-zA-Z])[.)、]\s?|[(（]\d{1,3}[)）]|[①-⑳])/
// 中日韩文字、假名、谚文与全角标点（含「」，。！？等）。
const CJK = /[⺀-鿿가-힯豈-﫿＀-￯　-〿]/

function joinLines(prev: string, next: string): string {
  if (CJK.test(prev.slice(-1)) || CJK.test(next.charAt(0))) return prev + next
  if (/[A-Za-z]-$/.test(prev) && /^[a-z]/.test(next)) return prev.slice(0, -1) + next
  return `${prev} ${next}`
}

export function mergeSoftBreaks(text: string): string {
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n[ \t　]*\n/)
  return paragraphs
    .map((para) => {
      const out: string[] = []
      for (const raw of para.split('\n')) {
        const line = raw.trim()
        if (line === '') continue
        if (out.length === 0 || LIST_ITEM.test(line)) out.push(line)
        else out[out.length - 1] = joinLines(out[out.length - 1], line)
      }
      return out.join('\n')
    })
    .filter((p) => p !== '')
    .join('\n\n')
}
