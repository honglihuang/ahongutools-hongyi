'use strict'
// 搜索框直出（决策 M2，events.md onMainPush）。callback 只同步返回数组（文档签名 MainPushResult[]，不返回 Promise）：
// 命中本机缓存返回译文，未命中返回「回车翻译：<原文前 30 字>」，不发起任何请求。
// 缓存：<插件本地数据目录>/mainpush-cache.json 的内存镜像（启动时同步读一次），LRU 上限 500，写入异步落盘。
// 文件格式 { context, entries }：context 是渲染层算的翻译上下文指纹（术语表 + 当前提示词，src/glossary/startup.ts），
// setContext 收到不同的指纹就清空全部条目，保证不会直出旧术语表 / 旧提示词下的译文。旧版文件是纯数组，按 context '' 读。
// 偏好：utools.dbStorage 'hongyi.prefs' 的 mainPush（smart / any / off）与 direction.native（契约 src/entry/contract.ts）。

const fs = require('node:fs')
const path = require('node:path')

const CACHE_FILE = 'mainpush-cache.json'
const CACHE_LIMIT = 500
const PREVIEW_CHARS = 30
const PREFS_KEY = 'hongyi.prefs'

/** 母语的字符范围（简单判定）：文本里有不属于母语文字、也不是数字/标点/空白的字符 = 含非母语字符。 */
const NATIVE_SCRIPT = {
  cmn: /\p{Script=Han}/u,
  'cmn-Hant': /\p{Script=Han}/u,
  yue: /\p{Script=Han}/u,
  jpn: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u,
  kor: /[\p{Script=Hangul}\p{Script=Han}]/u,
  rus: /\p{Script=Cyrillic}/u,
  ukr: /\p{Script=Cyrillic}/u,
  arb: /\p{Script=Arabic}/u,
  tha: /\p{Script=Thai}/u,
  heb: /\p{Script=Hebrew}/u,
  ell: /\p{Script=Greek}/u,
}
// 其余母语一律按拉丁文字判定（英语、西语、法语等不再细分）。
const LATIN = /\p{Script=Latin}/u
const NEUTRAL = /[\p{N}\p{P}\p{S}\p{Z}\s]/u

function hasForeignChars(text, native) {
  const nativeRe = NATIVE_SCRIPT[native] ?? LATIN
  for (const ch of text) {
    if (!NEUTRAL.test(ch) && !nativeRe.test(ch)) return true
  }
  return false
}

/** 与 src/entry/prefs.ts 的默认值一致：mode 'smart'、prefix 'fy '、native 'cmn'。 */
function readPushPrefs(stored) {
  const s = stored && typeof stored === 'object' ? stored : {}
  const mp = s.mainPush && typeof s.mainPush === 'object' ? s.mainPush : {}
  const mode = ['smart', 'any', 'off'].includes(mp.mode) ? mp.mode : 'smart'
  const prefix = typeof mp.prefix === 'string' ? mp.prefix : 'fy '
  const native = s.direction && typeof s.direction.native === 'string' && s.direction.native ? s.direction.native : 'cmn'
  return { mode, prefix, native }
}

/**
 * 搜索框文本 → 要翻译的原文；不推送时返回 null。
 * smart：以 prefix 开头（去掉前缀后翻译），或含非母语字符；any：任意非空文本；off：不推送。
 */
function sourceFor(text, prefs) {
  if (typeof text !== 'string' || prefs.mode === 'off') return null
  if (prefs.prefix !== '' && text.startsWith(prefs.prefix)) {
    const rest = text.slice(prefs.prefix.length).trim()
    return rest === '' ? null : rest
  }
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (prefs.mode === 'any') return trimmed
  return hasForeignChars(trimmed, prefs.native) ? trimmed : null
}

/** 插入顺序即新旧顺序的 LRU：读命中与写入都移到最新。 */
function createLru(limit, entries = []) {
  const map = new Map(entries.slice(-limit))
  return {
    get(key) {
      if (!map.has(key)) return undefined
      const v = map.get(key)
      map.delete(key)
      map.set(key, v)
      return v
    },
    set(key, value) {
      map.delete(key)
      map.set(key, value)
      while (map.size > limit) map.delete(map.keys().next().value)
    },
    entries: () => [...map.entries()],
    get size() {
      return map.size
    },
  }
}

const HIT_TITLE = '回车复制译文'
const MISS_TITLE = '回车进入翻译'

const validEntries = (list) => (Array.isArray(list) ? list.filter((e) => Array.isArray(e) && typeof e[0] === 'string' && e[1]) : [])

/** 同步读缓存文件；不存在或损坏时从空缓存开始（缓存可丢，不影响翻译）。 */
function loadCacheFile(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (Array.isArray(data)) return { context: '', entries: validEntries(data) }
    if (data && typeof data === 'object') {
      return { context: typeof data.context === 'string' ? data.context : '', entries: validEntries(data.entries) }
    }
  } catch {
    // 落到下面的空缓存
  }
  return { context: '', entries: [] }
}

/**
 * host：{ getDataDir, getStoredPrefs, copyText }，正式环境由 public/preload.js 传入 utools 的实现。
 * 返回 callback / onSelect（交给 utools.onMainPush）与 api（挂到 window.hongyiMainPush）。
 */
function createMainPush(host) {
  let lru
  let file
  let context = ''
  const cache = () => {
    if (!lru) {
      file = path.join(host.getDataDir(), CACHE_FILE)
      const loaded = loadCacheFile(file)
      context = loaded.context
      lru = createLru(CACHE_LIMIT, loaded.entries)
    }
    return lru
  }
  const prefs = () => readPushPrefs(host.getStoredPrefs())

  let writing = Promise.resolve()
  const persist = () => {
    const data = JSON.stringify({ context, entries: cache().entries() })
    writing = writing.then(async () => {
      const tmp = `${file}.${process.pid}.tmp`
      await fs.promises.mkdir(path.dirname(file), { recursive: true })
      await fs.promises.writeFile(tmp, data, 'utf8')
      await fs.promises.rename(tmp, file)
    }).catch((err) => console.warn('写搜索框直出缓存失败', err))
    return writing
  }

  /** 只处理 over / regex 匹配（payload 是文本）；功能指令「翻译」本身不推送。 */
  const sourceOfAction = (action) =>
    action && (action.type === 'over' || action.type === 'regex') ? sourceFor(action.payload, prefs()) : null

  /** onMainPush callback：同步、不发请求、不抛错。 */
  function callback(action) {
    try {
      const source = sourceOfAction(action)
      if (source === null) return []
      const hit = cache().get(source)
      if (hit) return [{ text: hit.text, title: `${HIT_TITLE}（${hit.target}）` }]
      const chars = Array.from(source)
      const preview = chars.length > PREVIEW_CHARS ? `${chars.slice(0, PREVIEW_CHARS).join('')}…` : source
      return [{ text: `回车翻译：${preview}`, title: MISS_TITLE }]
    } catch (err) {
      console.warn('搜索框直出出错', err)
      return []
    }
  }

  /** 命中项：复制译文、返回 false 不进入插件；未命中项：返回 true，进入 translate（payload 即原文，主界面去前缀）。 */
  function onSelect(action) {
    try {
      const source = sourceOfAction(action)
      const hit = source === null ? undefined : cache().get(source)
      const picked = action && action.option ? action.option.text : undefined
      if (hit && picked === hit.text) {
        host.copyText(hit.text)
        return false
      }
      return true
    } catch (err) {
      console.warn('搜索框直出选择出错', err)
      return true
    }
  }

  const api = Object.freeze({
    remember(source, entry) {
      if (typeof source !== 'string' || source.trim() === '' || !entry || typeof entry.text !== 'string' || entry.text === '') return
      cache().set(source.trim(), { text: entry.text, target: String(entry.target), providerId: String(entry.providerId) })
      void persist()
    },
    setContext(ctx) {
      if (typeof ctx !== 'string') return
      cache()
      if (ctx === context) return
      context = ctx
      lru = createLru(CACHE_LIMIT)
      void persist()
    },
    sourceOf(text) {
      const p = readPushPrefs(host.getStoredPrefs())
      const source = sourceFor(text, { ...p, mode: 'any' })
      return source ?? (typeof text === 'string' ? text.trim() : '')
    },
  })

  return { callback, onSelect, api, flush: () => writing }
}

module.exports = { createMainPush, sourceFor, readPushPrefs, hasForeignChars, createLru, CACHE_FILE, CACHE_LIMIT, PREFS_KEY }

