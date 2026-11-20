'use strict'
// 文件翻译用的读写（契约 FilesApi，src/bridge/contract.ts）：只读 txt/md/srt 的 UTF-8 文本；
// 写入只走 utools.showSaveDialog 让用户选的路径，原子写，不写到源文件上。

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const fsp = fs.promises

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.srt'])
const DEFAULT_MAX_BYTES = 512 * 1024

/** 扩展名（小写，含点）；不在白名单里时抛错。 */
function allowedExtension(file) {
  const ext = path.extname(file).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`只支持 .txt、.md、.srt 文件：${path.basename(file)}`)
  return ext
}

function assertPath(value, name) {
  if (typeof value !== 'string' || value === '') throw new TypeError(`${name} 必须是非空字符串`)
}

/** 两个路径是否指向同一个文件：先比规范化后的路径（Windows 不分大小写），再比 dev + ino（硬链接、符号链接、8.3 短名）。 */
async function isSameFile(a, b) {
  const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p))
  if (norm(a) === norm(b)) return true
  const [sa, sb] = await Promise.all([fsp.stat(a).catch(() => null), fsp.stat(b).catch(() => null)])
  return !!(sa && sb && sa.ino !== 0 && sa.dev === sb.dev && sa.ino === sb.ino)
}

/** 先写同目录临时文件并 fsync，再 rename 到目标；失败时删掉临时文件，目标保持原样。 */
async function writeTextAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  let handle
  try {
    handle = await fsp.open(tmp, 'wx')
    await handle.writeFile(text, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await fsp.rename(tmp, file)
  } catch (err) {
    if (handle) await handle.close().catch(() => {})
    await fsp.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

/** getUtools：返回 uTools API 对象，正式环境是全局 utools；测试传假对象。 */
function createFiles(getUtools = () => globalThis.utools) {
  const api = {
    async readText(file, maxBytes = DEFAULT_MAX_BYTES) {
      assertPath(file, 'path')
      if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw new TypeError('maxBytes 必须是正整数')
      allowedExtension(file)
      const handle = await fsp.open(file, 'r')
      let buf
      try {
        // 用打开后的句柄判断类型和大小，避免判断完到读取之间文件被换掉。
        const st = await handle.stat()
        if (!st.isFile()) throw new Error(`不是普通文件：${path.basename(file)}`)
        if (st.size > maxBytes) throw new Error(`文件超过 ${Math.floor(maxBytes / 1024)} KiB 上限：${path.basename(file)}`)
        // 多读 1 字节：读取期间文件变大也能发现。
        buf = Buffer.alloc(st.size + 1)
        let bytes = 0
        while (bytes < buf.length) {
          const { bytesRead } = await handle.read(buf, bytes, buf.length - bytes, bytes)
          if (bytesRead === 0) break
          bytes += bytesRead
        }
        if (bytes > maxBytes) throw new Error(`文件超过 ${Math.floor(maxBytes / 1024)} KiB 上限：${path.basename(file)}`)
        buf = buf.subarray(0, bytes)
      } finally {
        await handle.close()
      }
      let text
      try {
        // fatal：遇到非法 UTF-8 字节抛错，而不是悄悄换成替换字符；默认会去掉开头的 BOM。
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
      } catch {
        throw new Error(`文件不是 UTF-8 编码（如 GBK），请先另存为 UTF-8：${path.basename(file)}`)
      }
      return { text, bytes: buf.length }
    },

    async saveTextAs(defaultPath, content, avoidPath) {
      assertPath(defaultPath, 'defaultPath')
      if (typeof content !== 'string') throw new TypeError('content 必须是字符串')
      if (avoidPath !== undefined) assertPath(avoidPath, 'avoidPath')
      const ext = path.extname(defaultPath).slice(1)
      const target = getUtools().showSaveDialog({
        title: '另存译文',
        defaultPath,
        buttonLabel: '保存',
        filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
      })
      if (target === undefined || target === null || target === '') return null
      if (typeof target !== 'string') throw new TypeError('保存对话框返回了非字符串路径')
      if (avoidPath !== undefined && (await isSameFile(target, avoidPath))) {
        throw new Error('不能覆盖原文件，请换一个文件名')
      }
      await writeTextAtomic(target, content)
      return target
    },
  }
  return { api }
}

module.exports = { createFiles, DEFAULT_MAX_BYTES }
