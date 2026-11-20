'use strict'
// 纯规则：providerId 校验、哪些 URL 允许访问、请求头里 {{secret:<id>}} 何时替换成真实 key。

// 用 Node 的 URL 而不是页面全局的 URL，保证交给 http.request 的对象是 Node 认识的。
const { URL } = require('node:url')

// 明文 http 只放行本机回环地址（本地模型，如 Ollama）。
const LOOPBACK_HTTP_HOSTS = new Set(['localhost', '127.0.0.1'])
const PLACEHOLDER = /\{\{secret:([^}]*)\}\}/g
// 这些头由 preload 自己决定：host 必须跟 URL 一致；content-length 按实际 body 计算；
// accept-encoding 固定 identity，因为渲染层自己构造的 Response 不会解压。
const OVERRIDDEN_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'accept-encoding'])

/** providerId 会写进占位符，所以不能含 { }，也不能含控制字符。 */
function assertProviderId(providerId) {
  if (typeof providerId !== 'string' || providerId === '' || /[{}\u0000-\u001f\u007f]/.test(providerId)) {
    throw new TypeError('providerId 必须是非空字符串，且不含 { } 和控制字符')
  }
}

/** 解析 URL；协议不允许（只允许 https，以及 http://localhost、http://127.0.0.1）或解析失败时返回 undefined。 */
function parseAllowedUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return undefined
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return undefined
  }
  if (url.protocol === 'https:') return url
  if (url.protocol === 'http:' && LOOPBACK_HTTP_HOSTS.has(url.hostname)) return url
  return undefined
}

/** baseURL → origin；不允许时抛错。错误信息不带 baseURL 原文，以免用户把 key 误贴进 URL 后被带进日志。 */
function originOf(baseURL) {
  const url = parseAllowedUrl(baseURL)
  if (!url) throw new TypeError('baseURL 必须是 https 地址，或 http://localhost、http://127.0.0.1')
  return url.origin
}

function secretRef(providerId) {
  return `{{secret:${providerId}}}`
}

/**
 * 复制请求头，去掉 OVERRIDDEN_HEADERS，并替换值里的 {{secret:<id>}}。
 * 只有 id 就是本请求的 providerId、该 provider 存了 key、且请求 origin 正是 key 登记的 origin 时才替换；
 * 否则返回 { code, message }，整个请求不发。secret 是 { key, origin } 或 undefined（没存 key）。
 */
function resolveHeaders(headers, providerId, origin, secret) {
  const out = {}
  for (const [name, value] of Object.entries(headers)) {
    if (OVERRIDDEN_HEADERS.has(name.toLowerCase())) continue
    let failure
    out[name] = value.replace(PLACEHOLDER, (_, id) => {
      if (failure) return ''
      if (id !== providerId) {
        failure = { code: 'ORIGIN_NOT_ALLOWED', message: `请求头 ${name} 引用了其他 provider 的 key` }
      } else if (!secret) {
        failure = { code: 'SECRET_MISSING', message: `provider ${providerId} 没有保存 key` }
      } else if (secret.origin !== origin) {
        failure = { code: 'ORIGIN_NOT_ALLOWED', message: `provider ${providerId} 的 key 只允许发往 ${secret.origin}` }
      }
      return failure ? '' : secret.key
    })
    if (failure) return failure
  }
  return { headers: out }
}

module.exports = { assertProviderId, parseAllowedUrl, originOf, secretRef, resolveHeaders }
