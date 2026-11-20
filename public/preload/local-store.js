'use strict'
// 本机键值存储（翻译缓存、历史记录）：每个 key 一个 JSON 文件，放在 <插件本地数据目录>/store/ 下，不同步。

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { readJson, writeJsonAtomic, createKeyedQueue } = require('./fsutil.js')

const DIR_NAME = 'store'

/**
 * key → 文件名：小写字母、数字、- _ 原样保留，其余字节（大写字母、. / \ : 等）按 UTF-8 写成 %XX（大写十六进制）。
 * 大写字母也编码，是因为 Windows 文件名不分大小写，'A' 和 'a' 不编码会落到同一个文件。
 * 这样不同的 key 一定对应不同的文件名（忽略大小写也不同），也不会出现路径分隔符或 ..。
 * 结果再加上 v_ 前缀和 .json 后缀，所以也不会是 CON、NUL 这类 Windows 保留名。
 */
function fileNameOf(key) {
  if (typeof key !== 'string' || key === '') throw new TypeError('key 必须是非空字符串')
  const safe = Array.from(Buffer.from(key, 'utf8'), (byte) => {
    const ch = String.fromCharCode(byte)
    return /[a-z0-9_-]/.test(ch) ? ch : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }).join('')
  // 太长的 key 截断后加哈希，避免超过文件名长度上限（多数文件系统 255）。~ 在 safe 里总被编码，所以不会和短 key 撞名。
  if (safe.length <= 200) return `v_${safe}.json`
  const hash = crypto.createHash('sha256').update(key).digest('hex')
  return `v_${safe.slice(0, 120)}~${hash}.json`
}

/** getDataDir() 返回插件本地数据目录。返回值 api 就是 window.services.localStore。 */
function createLocalStore(getDataDir) {
  const queue = createKeyedQueue()
  const fileOf = (key) => path.join(getDataDir(), DIR_NAME, fileNameOf(key))

  // async：key 不合法时返回被拒绝的 Promise，而不是同步抛错，与契约的 Promise 签名一致。
  const api = {
    async get(key) {
      const file = fileOf(key)
      return queue(file, () => readJson(file))
    },
    async set(key, value) {
      const file = fileOf(key)
      return queue(file, () => writeJsonAtomic(file, value))
    },
    async remove(key) {
      const file = fileOf(key)
      return queue(file, () => fs.promises.rm(file, { force: true }))
    },
  }
  return { api }
}

module.exports = { createLocalStore, fileNameOf }
