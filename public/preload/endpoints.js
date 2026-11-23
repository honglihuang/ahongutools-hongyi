'use strict'
// 每种引擎的网络权限是一个确切的 POST 地址，不是整个 origin 或路径前缀。
const { parseAllowedUrl } = require('./policy.js')

function fixedBase(type, key) {
  switch (type) {
    case 'openai': return 'https://api.openai.com/v1'
    case 'deepseek': return 'https://api.deepseek.com'
    case 'deepl': return key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
    default: return undefined
  }
}

function endpointFor(type, rawBase, key = '') {
  const base = fixedBase(type, key) ?? rawBase
  const url = parseAllowedUrl(base)
  if (!url) throw new TypeError('服务地址无效；只支持 https 或本机 http，且不能包含凭据、参数或片段')
  const baseURL = type === 'deeplx' ? url.href : url.href.replace(/\/+$/, '')
  let suffix
  switch (type) {
    case 'openai': suffix = '/responses'; break
    case 'deepseek':
    case 'openai-compatible': suffix = '/chat/completions'; break
    case 'deepl': suffix = '/v2/translate'; break
    case 'deeplx': suffix = ''; break
    case 'ollama': suffix = '/api/chat'; break
    default: throw new TypeError('不支持此引擎类型')
  }
  return { baseURL, endpoint: baseURL + suffix }
}

module.exports = { endpointFor, fixedBase }
