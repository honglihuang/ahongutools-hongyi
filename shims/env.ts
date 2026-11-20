// 替换 upstream src/env/index.ts（按解析后的绝对路径）。上游默认指向 readfrog.app（env/shared.ts）；
// uTools 版不接入 Read Frog 账号与云端，云端地址一律置空：拼出的 URL 无效（new URL 抛错），不会连 readfrog.app。
export const env = {
  WXT_API_URL: '',
  WXT_WEBSITE_URL: '',
  WXT_OFFICIAL_SITE_ORIGINS: [] as string[],
  WXT_AUTH_COOKIE_DOMAINS: [] as string[],
  WXT_GOOGLE_CLIENT_ID: undefined,
  WXT_POSTHOG_HOST: undefined,
  WXT_POSTHOG_API_KEY: undefined,
  WXT_POSTHOG_TEST_UUID: undefined,
  WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: false,
}
