// uTools preload 入口（CommonJS，Node 20）：只负责组装各模块并挂到 window.services。
// 接口定义见 src/bridge/contract.ts；实现在 preload/ 目录下，零第三方依赖、不打包。
const { createServices } = require('./preload/index.js')
const { createMainPush, PREFS_KEY } = require('./preload/main-push.js')
const { createDataDirResolver } = require('./preload/data-dir.js')

const getDataDir = createDataDirResolver(utools)

window.services = createServices(getDataDir)

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
