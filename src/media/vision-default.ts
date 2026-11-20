// vision-engine.ts 的上游接线：读当前配置，用上游的模型工厂（经 vite.config.ts 注入的 fetchForProvider 走 preload 桥接）
// 发一条「提示词 + 图片」的消息。配置里的 apiKey 只是 {{secret:<id>}} 占位符，真实 key 只在 preload 里替换进请求头。
// 参数与上游 aiTranslate 相同：temperature、reasoning、providerOptions 按该 provider 的配置。
import type { LLMProviderConfig, ProviderConfig } from '@/types/config/provider'
import { generateText } from 'ai'
import { isLLMProviderConfig } from '@/types/config/provider'
import { getLocalConfig } from '@/utils/config/storage'
import { DEFAULT_CONFIG } from '@/utils/constants/config'
import { extractAISDKErrorMessage } from '@/utils/error/extract-message'
import { getLanguageModelForConfig } from '@/utils/providers/model'
import { resolveModelId } from '@/utils/providers/model-id'
import { getProviderOptionsWithOverride } from '@/utils/providers/options'
import { getTopLevelReasoning } from '@/utils/providers/reasoning'
import { getEngineChoice } from '../entry/default-engine.ts'
import { recognizeAndTranslate } from './vision.ts'
import { createPlanVisionTarget, createRecognizeWithDefaultEngine } from './vision-engine.ts'

const planDeps = {
  loadProviders: async () => ((await getLocalConfig()) ?? DEFAULT_CONFIG).providersConfig,
  getEngineChoice,
  modelOf: (p: ProviderConfig) => (isLLMProviderConfig(p) ? (resolveModelId(p.model) ?? '') : ''),
}

export const planVisionTarget = createPlanVisionTarget(planDeps)

export const recognizeWithDefaultEngine = createRecognizeWithDefaultEngine({
  ...planDeps,
  async askProvider(p, prompt, imageDataUrl, signal) {
    if (!isLLMProviderConfig(p)) throw new Error(`「${p.name}」不是大模型引擎，不能识别图片`)
    const config: LLMProviderConfig = p
    const modelName = resolveModelId(config.model) ?? ''
    const reasoning = getTopLevelReasoning(config)
    try {
      const { text } = await generateText({
        model: getLanguageModelForConfig(config),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image', image: imageDataUrl },
            ],
          },
        ],
        reasoning,
        temperature: config.temperature,
        providerOptions: getProviderOptionsWithOverride(modelName, config.provider, config.providerOptions, reasoning),
        abortSignal: signal,
        maxRetries: 0,
      })
      return text
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      throw new Error(extractAISDKErrorMessage(e))
    }
  },
  askUtools: recognizeAndTranslate,
})
