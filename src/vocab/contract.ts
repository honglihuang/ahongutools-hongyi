// 生词本共享契约（第三阶段第二批）。改动这个文件 = 改共享接口，必须先停下报告 advisor。
// 存储：window.services.localStore 键 'vocab'（本机，不随 uTools 同步）。首版不做复习排程、同步、AI 词条。

/** 只对短文本开放「加入生词本」：不超过 3 个词或不超过 30 个字符（满足其一即可，按 trim 后的原文算）。 */
export const VOCAB_MAX_WORDS = 3
export const VOCAB_MAX_CHARS = 30

export interface VocabEntry {
  id: string // crypto.randomUUID()
  /** 原文（词或短语），保存前用户可改 */
  term: string
  /** 释义，默认取当前译文，保存前用户可改 */
  meaning: string
  /** ISO 639-3，原文语言；不确定时 'und' */
  sourceLang: string
  /** ISO 639-3，释义语言 */
  targetLang: string
  /** 加入时的来源入口 */
  from: 'hub' | 'paste' | 'shot' | 'manual'
  createdAt: number
  updatedAt: number
}

/** 「加入生词本」入口要的草稿：入口只负责给出这些，打开编辑框、判重、保存都由 src/vocab 负责。 */
export interface VocabDraft {
  term: string
  meaning: string
  sourceLang: string
  targetLang: string
  from: VocabEntry['from']
}

// 实现在 src/vocab/（生词本工作流）：
//   canAddToVocab(term: string): boolean            — src/vocab/logic.ts，按上面两个上限判断
//   <AddToVocabButton draft={VocabDraft | null} />  — src/vocab/add-button.tsx，默认导出；draft 为 null 或超长时不渲染；
//                                                    点击或 Ctrl+D 打开编辑框，保存后显示「已加入生词本」
//   view.tsx                                        — 生词本列表视图（默认导出，ViewProps）
