// uTools preload 入口（CommonJS，Node 20）：只负责组装各模块并挂到 window.services。
// 接口定义见 src/bridge/contract.ts；实现在 preload/ 目录下，零第三方依赖、不打包。
const { createServices } = require('./preload/index.js')
const { createMainPush, PREFS_KEY } = require('./preload/main-push.js')
const { createDataDirResolver } = require('./preload/data-dir.js')

const resolveDataDir = createDataDirResolver(utools)
// 在页面脚本运行前解析目录，授权数据不受页面传入路径影响。
const dataDir = resolveDataDir()
const getDataDir = () => dataDir

// 预加载时绑定浏览器原生确认。页面不传入确认结果，也不能用替换 window.confirm 来跳过它。
const confirmAddress = typeof window.confirm === 'function' && window.confirm.bind(window)
window.services = createServices(getDataDir, (endpoint) => confirmAddress && confirmAddress(
  `允许洪译向此地址发送翻译内容？\n\n${endpoint}\n\n翻译可能发送原文、上下文或图片；填写 API key 时也会发送给此服务。地址变更需要重新确认。`,
))

// 搜索框直出（plugin.json 的 translate 功能配了 mainPush: true）。在 preload 注册：preload 在主界面加载前执行
// （development/preload.md），而插件页面未加载时 onMainPush 回调能否收到、前端注册与 preload 注册有无差异，
// events.md 都没写（实测 T-9）。缓存的写入口挂在 window.hongyiMainPush，主界面翻译完成后调用。
const mainPush = createMainPush({
  getDataDir,
  getStoredPrefs: () => utools.dbStorage.getItem(PREFS_KEY),
  copyText: (text) => utools.copyText(text),
})
utools.onMainPush(mainPush.callback, mainPush.onSelect)
window.hongyiMainPush = mainPush.api
