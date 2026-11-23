'use strict'
// 网络请求：只向 preload 授权的具体端点发送 POST，在 preload 里替换该引擎的认证占位符，
// 结果按 head → chunk* → done | error 推给渲染层。不跟随重定向，不打印日志。

const http = require('node:http')
const https = require('node:https')
const { assertProviderId, parseAllowedUrl, resolveHeaders } = require('./policy.js')

// 空闲超时：从发起请求到收到响应头、以及两次收到数据之间的最长等待；流式响应只要持续有数据就不会超时。
const DEFAULT_TIMEOUT_MS = 60_000
const MAX_TIMER_MS = 2 ** 31 - 1
const MAX_REQUEST_BYTES = 1024 * 1024
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024

/** 契约外的调用方式属于代码错误，同步抛 TypeError，不发任何事件。 */
function assertRequest(req, onEvent) {
  if (typeof onEvent !== 'function') throw new TypeError('onEvent 必须是函数')
  if (!req || typeof req.taskId !== 'string' || req.taskId === '') throw new TypeError('taskId 必须是非空字符串')
  assertProviderId(req.providerId)
  if (req.method !== 'GET' && req.method !== 'POST') throw new TypeError('method 只能是 GET 或 POST')
  if (!req.headers || typeof req.headers !== 'object' || Object.values(req.headers).some((v) => typeof v !== 'string')) {
    throw new TypeError('headers 必须是 Record<string, string>')
  }
  if (req.body !== undefined && typeof req.body !== 'string') throw new TypeError('body 必须是字符串')
  if (req.timeoutMs !== undefined && !(Number.isFinite(req.timeoutMs) && req.timeoutMs > 0)) {
    throw new TypeError('timeoutMs 必须是正数')
  }
}

/** Node 的响应头（set-cookie 等是数组）压平成 Record<string, string>。 */
function flattenHeaders(raw) {
  const out = {}
  for (const [name, value] of Object.entries(raw)) out[name] = Array.isArray(value) ? value.join(', ') : value
  return out
}

/**
 * lookupAccess(providerId) 由 preload 私下读取绑定，不暴露给页面。
 */
function createNet(lookupAccess) {
  const tasks = new Map() // taskId → 中止该任务的函数

  const api = {
    request(req, onEvent) {
      assertRequest(req, onEvent)
      if (tasks.has(req.taskId)) throw new TypeError(`taskId ${req.taskId} 正在进行中`)
      startTask({ ...req, headers: { ...req.headers } }, onEvent)
    },
    cancel(taskId) {
      const abort = tasks.get(taskId)
      if (abort) abort('CANCELLED', '请求已取消')
    },
  }

  function startTask(req, onEvent) {
    const { taskId, providerId } = req
    const timeoutMs = Math.min(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMER_MS)
    let finished = false
    let clientReq
    let secretKey
    // 错误信息里万一出现 key（例如某个底层报错带了请求头），替换掉再交给渲染层。
    const redact = (message) => (secretKey ? String(message).split(secretKey).join('***') : String(message))

    // 所有事件都从这里发：终止事件（done / error）只发一次，之后的任何事件都丢弃。
    const emit = (event) => {
      if (finished) return
      if (event.type === 'done' || event.type === 'error') {
        finished = true
        tasks.delete(taskId)
        clearTimeout(timer)
        if (event.type === 'error' && clientReq) clientReq.destroy()
      }
      onEvent(event)
    }
    const fail = (code, message) => emit({ type: 'error', code, message: redact(message) })
    let timer
    const arm = () => {
      clearTimeout(timer)
      if (finished) return
      timer = setTimeout(() => fail('TIMEOUT', `${timeoutMs} ms 内没有收到上游数据`), timeoutMs)
    }

    arm()
    tasks.set(taskId, fail)
    ;(async () => {
      const url = parseAllowedUrl(req.url)
      const access = await lookupAccess(providerId)
      if (req.method !== 'POST' || !url || !access || url.href !== access.endpoint) {
        return fail('ORIGIN_NOT_ALLOWED', '请求地址未授权；请到「洪译设置」核对并保存引擎')
      }
      secretKey = access.key
      const resolved = resolveHeaders(req.headers, providerId, access)
      if (resolved.code) return fail(resolved.code, resolved.message)
      const body = req.body === undefined ? undefined : Buffer.from(req.body, 'utf8')
      if (body && body.length > MAX_REQUEST_BYTES) {
        return fail('TOO_LARGE', `请求体 ${body.length} 字节，超过上限 ${MAX_REQUEST_BYTES}`)
      }
      if (finished) return // 准备阶段已被取消或超时
      send(url, resolved.headers, body)
    })().catch((err) => fail('NETWORK', err.message))

    function send(url, headers, body) {
      const options = { method: 'POST', headers: { ...headers, 'accept-encoding': 'identity' } }
      if (body) options.headers['content-length'] = String(body.length)
      try {
        clientReq = (url.protocol === 'https:' ? https : http).request(url, options)
      } catch (err) {
        return fail('NETWORK', err.message) // 例如请求头含非法字符
      }
      clientReq.on('error', (err) => fail('NETWORK', err.message))
      clientReq.on('response', (res) => {
        res.on('error', (err) => fail('NETWORK', err.message))
        if (res.statusCode >= 300 && res.statusCode < 400) {
          return fail('REDIRECT_BLOCKED', `上游返回 ${res.statusCode}，不跟随重定向`)
        }
        arm()
        emit({ type: 'head', status: res.statusCode, headers: flattenHeaders(res.headers) })
        let received = 0
        res.on('data', (chunk) => {
          if (finished) return
          received += chunk.length
          if (received > MAX_RESPONSE_BYTES) {
            return fail('TOO_LARGE', `响应体超过上限 ${MAX_RESPONSE_BYTES} 字节`)
          }
          arm()
          // 复制成独立的 Uint8Array：Node 的 Buffer 可能是共享内存池的切片，不把整块池子交给渲染层。
          emit({ type: 'chunk', data: new Uint8Array(chunk) })
        })
        res.on('end', () => emit({ type: 'done' }))
        res.on('close', () => {
          if (!res.complete) fail('NETWORK', '响应未完整接收，连接已断开')
        })
      })
      clientReq.end(body)
    }
  }

  return { api }
}

module.exports = { createNet, DEFAULT_TIMEOUT_MS, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES }
