'use strict'
// 授权和 key 一起写入本机文件；只读取新版记录，旧 origin 记录不是授权。
const { createMapFile } = require('./fsutil.js')
const { endpointFor, fixedBase } = require('./endpoints.js')
const { assertProviderId, secretRef } = require('./policy.js')

function createEngineAccess(getDataDir, confirmDestination) {
  const store = createMapFile(getDataDir, 'engine-access-v1.state', 0o600)
  const lookup = async (id) => {
    const row = (await store.read()).get(id)
    if (!row || typeof row.key !== 'string' || typeof row.baseURL !== 'string') return undefined
    const { endpoint } = endpointFor(row.type, row.baseURL, row.key)
    return row.endpoint === endpoint ? { type: row.type, endpoint, key: row.key } : undefined
  }
  return {
    lookup,
    api: {
      async save(id, type, baseURL, key) {
        assertProviderId(id)
        if (id === 'utools-ai') throw new TypeError('不能更改 uTools AI 的地址')
        if (typeof key !== 'string' || /[^\x21-\x7e]/.test(key)) throw new TypeError('API key 无效')
        await store.update((map) => {
          const old = map.get(id)
          const nextKey = key || old?.key || ''
          const { baseURL: base, endpoint } = endpointFor(type, baseURL, nextKey)
          const fixed = fixedBase(type, nextKey) !== undefined
          const same = old?.type === type && old.endpoint === endpoint
          if (old?.key && !same && !key) throw new Error('服务地址已变更，请重新输入 API key')
          if ((fixed && !nextKey) || ((type === 'ollama' || type === 'deeplx') && nextKey)) {
            throw new Error('此引擎的 API key 配置无效')
          }
          if (!fixed && !same && confirmDestination?.(endpoint) !== true) throw new Error('未授权该服务地址')
          map.set(id, { type, baseURL: base, endpoint, key: nextKey })
          baseURL = base
          key = nextKey
        })
        return { baseURL, hasKey: key !== '' }
      },
      async has(id) {
        assertProviderId(id)
        return !!(await lookup(id))?.key
      },
      async remove(id) {
        assertProviderId(id)
        await store.update((map) => map.delete(id))
      },
      ref(id) {
        assertProviderId(id)
        return secretRef(id)
      },
    },
  }
}

module.exports = { createEngineAccess }
