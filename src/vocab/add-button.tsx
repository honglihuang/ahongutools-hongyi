// 入口用的「加入生词本」按钮（契约见 contract.ts）：draft 为 null 或原文超长时不渲染。
// 点按钮或按 Ctrl+D 打开对话框，按 draft 预填，用户可改原文、释义、语言；保存后在按钮旁显示「已加入生词本」或「已更新」。
// 用对话框而不是页内表单：主界面在焦点不在输入框时把 Enter 当「复制并关闭」，对话框里（role="dialog"）按键交还给表单。
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/base-ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/base-ui/dialog'
import type { VocabDraft } from './contract.ts'
import { canAddToVocab } from './logic.ts'
import { VocabForm } from './vocab-form.tsx'

export default function AddToVocabButton({ draft }: { draft: VocabDraft | null }) {
  const usable = draft !== null && canAddToVocab(draft.term)
  // 打开时的草稿：对话框开着时卡片结果变了，不改正在编辑的内容。
  const [opened, setOpened] = useState<{ draft: VocabDraft; key: number } | null>(null)
  const [message, setMessage] = useState('')
  const latest = useRef({ draft, usable })
  latest.current = { draft, usable }

  const open = () => {
    const { draft: d, usable: ok } = latest.current
    if (!d || !ok) return
    setMessage('')
    setOpened((o) => o ?? { draft: d, key: Date.now() })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.altKey || e.shiftKey || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'd') return
      if (!latest.current.usable) return
      e.preventDefault()
      open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 3000)
    return () => clearTimeout(timer)
  }, [message])

  if (!usable) return null
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={open}>
        加入生词本
      </Button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
      <Dialog open={opened !== null} onOpenChange={(isOpen) => !isOpen && setOpened(null)}>
        {opened && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>加入生词本</DialogTitle>
            </DialogHeader>
            <VocabForm
              key={opened.key}
              initial={opened.draft}
              mode={{ kind: 'add', from: opened.draft.from }}
              onSaved={(text) => {
                setOpened(null)
                setMessage(text)
              }}
              onCancel={() => setOpened(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </span>
  )
}
