// Read Frog 托管 AI（read-frog-free-ai）在 uTools 里不可用：账号与云端不接入。
// 给上游一个「未登录」的明确判定，选择器把内置 AI 显示为灰色不可选（isDurablyUnusableTier），
// 万一被调用（serializeProviderRef）也会因 available=false 抛错，不会去连 readfrog.app。
import type { HostedAiStatus, HostedAiTierStatus } from '@/utils/hosted-ai/types'

const FEATURES = [
  'pageTranslation',
  'selectionTranslation',
  'videoSubtitles',
  'inputTranslation',
  'noteSuggestion',
  'customAction',
  'languageDetection',
] as const

const UNAVAILABLE = {
  available: false,
  unavailableReason: 'authentication_required',
} as unknown as HostedAiTierStatus

export const HOSTED_AI_UNAVAILABLE_STATUS = {
  features: Object.fromEntries(FEATURES.map((f) => [f, { normal: UNAVAILABLE, advance: UNAVAILABLE }])),
  pools: [],
} as unknown as HostedAiStatus
