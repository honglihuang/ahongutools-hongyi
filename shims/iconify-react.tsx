// `@iconify/react` 的替代。原组件运行时从 api.iconify.design 拉图标数据（外部资源，决策 L5 禁止）。
// 这里把 translation hub 闭包实际用到的 tabler 图标映射到本地打包的 @tabler/icons-react；未登记的名字明确抛错。
import type { ComponentType } from 'react'
import {
  IconAlertCircle,
  IconArrowsExchange,
  IconChevronDown,
  IconChevronUp,
  IconChevronsDown,
  IconChevronsUp,
  IconCopy,
  IconLanguageOff,
  IconLoader2,
  IconMessage2,
  IconPlayerStopFilled,
  IconRefresh,
  IconSparkles,
  IconVolume,
  IconX,
} from '@tabler/icons-react'

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'tabler:alert-circle': IconAlertCircle,
  'tabler:arrows-exchange': IconArrowsExchange,
  'tabler:chevron-down': IconChevronDown,
  'tabler:chevron-up': IconChevronUp,
  'tabler:chevrons-down': IconChevronsDown,
  'tabler:chevrons-up': IconChevronsUp,
  'tabler:copy': IconCopy,
  'tabler:language-off': IconLanguageOff,
  'tabler:loader-2': IconLoader2,
  'tabler:message-2': IconMessage2,
  'tabler:player-stop-filled': IconPlayerStopFilled,
  'tabler:refresh': IconRefresh,
  'tabler:sparkles': IconSparkles,
  'tabler:volume': IconVolume,
  'tabler:x': IconX,
}

export function Icon({ icon, className }: { icon: string; className?: string }) {
  const Component = ICONS[icon]
  if (!Component) throw new Error(`icon "${icon}" is not bundled; add it to shims/iconify-react.tsx`)
  return <Component className={className} />
}
