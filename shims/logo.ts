// 替换 upstream utils/logo.ts（按解析后的绝对路径）。原实现返回 unpkg 上 lobehub 图标 CDN 地址（外部图片，决策 L5 禁止）。
// 这里统一返回上游自带的通用 provider 图标（本地打包）；品牌图标第二阶段再定。
import genericProviderLogo from '@/assets/providers/custom-provider.svg?url&no-inline'

export function getLobeIconsCDNUrlFn(_iconSlug: string) {
  return () => genericProviderLogo
}
