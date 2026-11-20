'use strict'
// API key 存在插件本地数据目录下的 secrets.json：不进 utools.db / dbStorage，不参与同步。
// 给渲染层的 api 只有 set / has / remove / ref，返回值和错误信息都不含 key；lookup 只给 net 模块用。

const { assertProviderId, originOf, secretRef } = require('./policy.js')
const { createMapFile } = require('./fsutil.js')

const FILE_NAME = 'secrets.json'
// POSIX 上只有当前用户可读写；Windows 忽略这个值，文件继承所在目录的 ACL。
const FILE_MODE = 0o600

/** getDataDir() 返回插件本地数据目录。文件内容：{ [providerId]: { key, origin } }。 */
function createSecrets(getDataDir) {
  const store = createMapFile(getDataDir, FILE_NAME, FILE_MODE)

  const api = {
    async set(providerId, key, baseURL) {
      assertProviderId(providerId)
      if (typeof key !== 'string' || key === '' || /[\u0000-\u001f\u007f]/.test(key)) {
        throw new TypeError('key 必须是非空字符串，且不含换行等控制字符')
      }
      const origin = originOf(baseURL)
      await store.update((map) => map.set(providerId, { key, origin }))
    },
    async has(providerId) {
      assertProviderId(providerId)
      return (await store.read()).has(providerId)
    },
    async remove(providerId) {
      assertProviderId(providerId)
      await store.update((map) => map.delete(providerId))
    },
    ref(providerId) {
      assertProviderId(providerId)
      return secretRef(providerId)
    },
  }

  /** 只给 net 用：返回 { key, origin }，没存过返回 undefined。 */
  const lookup = async (providerId) => (await store.read()).get(providerId)

  return { api, lookup }
}

module.exports = { createSecrets }
