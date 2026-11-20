// 替换 upstream/read-frog/src/components/llm-providers/use-hosted-ai-status.ts（按解析后的绝对路径）。
// 原模块经 better-auth 与 oRPC 访问 readfrog.app；这里固定返回「需要登录」，托管 AI 显示为不可用。
import type { HostedAiStatusResult } from '../upstream/read-frog/src/components/llm-providers/use-hosted-ai-status'
import { HOSTED_AI_UNAVAILABLE_STATUS } from '../src/upstream-adapter/hosted-ai-status.ts'

export type { HostedAiStatusResult }

export function useHostedAiStatus(_options: { enabled?: boolean } = {}): HostedAiStatusResult {
  return { status: HOSTED_AI_UNAVAILABLE_STATUS, isSignedIn: false, isPending: false, isError: false }
}
