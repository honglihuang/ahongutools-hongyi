'use strict'
// 组装 window.services：只暴露契约（src/bridge/contract.ts）里的方法，不暴露 fs、模块对象或内部的 key 查询函数。

const { createSecrets } = require('./secrets.js')
const { createNet } = require('./net.js')
const { createLocalStore } = require('./local-store.js')
const { createFiles } = require('./files.js')

/** getDataDir：返回插件本地数据目录的函数，正式环境是 data-dir.js 的 createDataDirResolver(utools)。 */
function createServices(getDataDir) {
  const secrets = createSecrets(getDataDir)
  const net = createNet(getDataDir, secrets.lookup)
  const localStore = createLocalStore(getDataDir)
  const files = createFiles()
  // 冻结后渲染层无法替换方法（例如把 net.request 换成别的实现）。
  return Object.freeze({
    secrets: Object.freeze({ ...secrets.api }),
    net: Object.freeze({ ...net.api }),
    localStore: Object.freeze({ ...localStore.api }),
    files: Object.freeze({ ...files.api }),
  })
}

module.exports = { createServices }
