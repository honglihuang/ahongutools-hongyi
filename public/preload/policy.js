'use strict'
// 纯规则：providerId 校验、哪些 URL 允许访问、请求头里 {{secret:<id>}} 何时替换成真实 key。

// 用 Node 的 URL 而不是页面全局的 URL，保证交给 http.request 的对象是 Node 认识的。
const { URL } = require('node:url')

// 明文 http 只放行本机回环地址（本地模型，如 Ollama）。
const LOOPBACK_HTTP_HOSTS = new Set(['localhost', '127.0.0.1'])
const PLACEHOLDER = '{{secret:'
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
  if (typeof rawUrl !== 'string' || rawUrl.length > 500 || /[\u0000- \u007f\\?#]|%(?:2f|5c|00|25)/i.test(rawUrl)) return undefined
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return undefined
  }
  if (url.username || url.password) return undefined
  if (url.protocol === 'https:') return url
  if (url.protocol === 'http:' && LOOPBACK_HTTP_HOSTS.has(url.hostname)) return url
  return undefined
}

function secretRef(providerId) {
  return `{{secret:${providerId}}}`
}

// 只在已核对端点之后，并且只在该引擎预期的认证头内替换完整占位符。
function resolveHeaders(headers, providerId, access) {
  const out = Object.create(null)
  const prefix = access.type === 'deepl' ? 'DeepL-Auth-Key ' : 'Bearer '
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (OVERRIDDEN_HEADERS.has(lower)) continue
    if (!value.includes(PLACEHOLDER)) {
      out[lower] = value
      continue
    }
    if (lower !== 'authorization' || value !== prefix + secretRef(providerId)) {
      return { code: 'ORIGIN_NOT_ALLOWED', message: '请求头中的认证占位符不匹配' }
    }
    if (!access.key) return { code: 'SECRET_MISSING', message: '请在「洪译设置」保存 API key' }
    out[lower] = prefix + access.key
  }
  return { headers: out }
}

module.exports = { assertProviderId, parseAllowedUrl, secretRef, resolveHeaders }
