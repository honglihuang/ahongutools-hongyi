'use strict'
// 插件本地数据目录：所有调用方（services、搜索框直出缓存）共用这一个解析函数。
// utools.getPluginLocalDataPath 是新版运行时才有的 API，uTools 7.8.0 没有（调用报 is not a function）；
// 没有时改用 <getPath('appData')>/hongyi-utools，并递归创建。

const fs = require('node:fs')
const path = require('node:path')

const FALLBACK_DIR_NAME = 'hongyi-utools'

/** u：uTools API 对象，正式环境是全局 utools；测试传假对象。返回 () => 数据目录，结果在第一次成功后缓存。 */
function createDataDirResolver(u) {
  let dir
  return () => {
    if (dir === undefined) {
      if (typeof u.getPluginLocalDataPath === 'function') {
        dir = u.getPluginLocalDataPath()
      } else {
        const fallback = path.join(u.getPath('appData'), FALLBACK_DIR_NAME)
        fs.mkdirSync(fallback, { recursive: true })
        dir = fallback
      }
    }
    return dir
  }
}

module.exports = { createDataDirResolver, FALLBACK_DIR_NAME }
