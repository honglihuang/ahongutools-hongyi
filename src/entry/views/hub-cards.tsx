// 结果卡片列表：与上游 TranslationPanel 相同的数据与空状态（文案直接写中文：shims/wxt-i18n.d.ts 的宽类型下
// 单参数 i18n.t 过不了我方类型检查），外面多包一层用来标出键盘选中的卡片。
// 卡片本身是上游 TranslationCard，不改。
import { Icon } from '@iconify/react'
import { useAtomValue, useSetAtom } from 'jotai'
import * as React from 'react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/base-ui/empty'
import { selectedProviderIdsAtom, translationCardExpandedStateAtom } from '@/entrypoints/translation-hub/atoms'
import { TranslationCard } from '@/entrypoints/translation-hub/components/translation-card'
import { cn } from '@/utils/styles/utils'

export function HubCards({ selected }: { selected: number }) {
  const ids = useAtomValue(selectedProviderIdsAtom)
  const expandedById = useAtomValue(translationCardExpandedStateAtom)
  const setExpandedById = useSetAtom(translationCardExpandedStateAtom)
  const refs = React.useRef<Array<HTMLDivElement | null>>([])

  React.useEffect(() => {
    refs.current[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (ids.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon icon="tabler:language-off" className="size-6" />
          </EmptyMedia>
          <EmptyTitle>没有选择翻译服务</EmptyTitle>
          <EmptyDescription>在右上角的服务下拉里选择至少一个翻译服务。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-3">
      {ids.map((id, i) => (
        <div
          key={id}
          ref={(el) => void (refs.current[i] = el)}
          aria-current={i === selected ? 'true' : undefined}
          className={cn('rounded-xl', i === selected && ids.length > 1 && 'ring-2 ring-ring')}
        >
          <TranslationCard
            providerId={id}
            isExpanded={expandedById[id] ?? true}
            onExpandedChange={(expanded) => setExpandedById((prev) => ({ ...prev, [id]: expanded }))}
          />
        </div>
      ))}
    </div>
  )
}
