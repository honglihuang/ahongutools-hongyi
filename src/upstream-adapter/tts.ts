// 朗读（TTS）在 uTools 版不提供：上游经后台消息 edgeTtsSynthesize 调微软 Edge 的非官方接口，拿到音频字节再播放。
// 浏览器 speechSynthesis 只能直接发声、给不出音频字节，接不进上游的消息协议；要用它得重写上游 useTextToSpeech。
// vite.config.ts 在构建期给 translation hub 的朗读按钮加上这个开关，按钮不渲染，也就不会发出未注册的消息。
export const TTS_AVAILABLE = false
