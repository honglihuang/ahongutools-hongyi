'use strict'
// 本地数据目录下的 JSON 文件读写：原子写（临时文件 → fsync → rename），同一进程内写入串行。

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const fsp = fs.promises
// preload 与页面可能共享全局；不从页面重新取 JSON 编解码函数。
const { parse, stringify } = JSON

/** 读 JSON 文件；文件不存在返回 undefined。 */
async function readJson(file) {
  let text
  try {
    text = await fsp.readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return undefined
    throw err
  }
  try {
    return parse(text)
  } catch {
    // JSON.parse 的错误可能包含存储原文（包括 key），不要把原文带进报错。
    throw new Error(`${path.basename(file)} 不是合法的 JSON`)
  }
}

/** 先写同目录临时文件并 fsync，再 rename 覆盖目标；失败时删掉临时文件，目标保持原样。 */
async function writeJsonAtomic(file, data, mode = 0o666) {
  const text = stringify(data)
  if (typeof text !== 'string') throw new TypeError('值无法序列化为 JSON（undefined、函数或 symbol）')
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  let handle
  try {
    handle = await fsp.open(tmp, 'wx', mode)
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

/** 按 key 串行：同一 key 的任务按调用顺序一个接一个跑（前一个失败不影响后一个），不同 key 互不等待。 */
function createKeyedQueue() {
  const tails = new Map()
  return (key, task) => {
    const run = (tails.get(key) || Promise.resolve()).then(task)
    const tail = run.catch(() => {})
    tails.set(key, tail)
    tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key)
    })
    return run
  }
}

/** dataDir 下的一个 JSON 对象文件当 Map 用（providerId → 值）：读和改都排队，改完原子写回。 */
function createMapFile(getDataDir, fileName, mode) {
  const queue = createKeyedQueue()
  const file = () => path.join(getDataDir(), fileName)
  const load = async () => new Map(Object.entries((await readJson(file())) ?? {}))
  return {
    read: () => queue(fileName, load),
    update: (mutate) =>
      queue(fileName, async () => {
        const map = await load()
        mutate(map)
        await writeJsonAtomic(file(), Object.fromEntries(map), mode)
      }),
  }
}

module.exports = { readJson, writeJsonAtomic, createKeyedQueue, createMapFile }
