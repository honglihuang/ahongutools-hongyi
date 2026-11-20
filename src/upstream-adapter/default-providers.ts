// uTools 版的默认 provider 列表（替换上游 DEFAULT_PROVIDER_CONFIG_LIST 的取值，见 vite.config.ts）。
// - 预置 utools.ai：上游 openai-compatible provider，baseURL 是虚拟端点，请求由 createUtoolsAiFetch 完成（决策 E1）。
// - 去掉 Google、Microsoft 免 key 接口（E2）与 jalapenocloud 等商业预置（L4）；保留需要用户自带 key 的 OpenAI、DeepSeek，默认关闭。
import { UTOOLS_AI_BASE_URL } from '../engine/contract.ts'

export const UTOOLS_AI_PROVIDER_ID = 'utools-ai'

/**
 * 上游要求模型 id 非空（resolveModelId 为空就抛 "Model is undefined"），这里放一个占位 id；
 * provider-fetch.ts 在请求体里看到它就删掉 model 字段，utools.ai 用默认模型。
 */
export const UTOOLS_AI_DEFAULT_MODEL = 'utools-default'

export const UTOOLS_AI_PROVIDER_CONFIG = {
  id: UTOOLS_AI_PROVIDER_ID,
  name: 'uTools AI',
  description: '使用 uTools 内置 AI，会消耗你的 uTools AI 能量',
  enabled: true,
  provider: 'openai-compatible',
  baseURL: UTOOLS_AI_BASE_URL,
  // 上游 openai-compatible 只接受自定义模型（schema 固定 isCustomModel: true）。
  model: { model: 'use-custom-model', isCustomModel: true, customModel: UTOOLS_AI_DEFAULT_MODEL },
} as const

interface DefaultProviderSources {
  openai: object
  deepseek: object
}

/** 参数是上游 DEFAULT_PROVIDER_CONFIG，取它的 openai、deepseek 两项，避免复制上游的模型默认值。 */
export function buildDefaultProviderList<T>(upstream: DefaultProviderSources): T {
  return [
    UTOOLS_AI_PROVIDER_CONFIG,
    { ...upstream.openai, enabled: false },
    { ...upstream.deepseek, enabled: false },
  ] as T
}
