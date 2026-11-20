// 替换 upstream utils/error-action.ts（按解析后的绝对路径）。原模块用 env.WXT_WEBSITE_URL 拼 Read Frog 网站的
// 定价、登录、账单地址；uTools 版不接入账号与云端，WXT_WEBSITE_URL 为空，原实现 new URL 会抛错。
// 这里一律返回 undefined：调用方的 action 都是可选字段，没有 action 就不显示按钮，也不会打开任何网址。
export type { ErrorAction, ExtensionPricingEntry } from '../upstream/read-frog/src/utils/error-action'

export function pricingUrl(): undefined {
  return undefined
}

export function billingUrl(): undefined {
  return undefined
}

export function logInUrl(): undefined {
  return undefined
}

export function upgradeAction(): undefined {
  return undefined
}

export function billingAction(): undefined {
  return undefined
}

export function logInAction(): undefined {
  return undefined
}
