// 直接编译上游 Read Frog 的 translation hub（submodule upstream/read-frog），在构建期替换扩展边界。
// 替换清单与理由见各 shim 文件头注释；规则分三类：
//   1) resolve.alias：包级与 `@/` 路径。
//   2) upstreamModuleSwap（resolveId）：按解析后的绝对路径整模块替换，覆盖相对路径引用。
//   3) upstreamSourcePatch（transform）：改上游个别语句（不改 submodule 文件），每条都必须命中，否则构建失败。
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ViteYaml from '@modyfi/vite-plugin-yaml'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { stripFeatures } from './scripts/release-manifest.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const upstreamSrc = path.join(root, 'upstream/read-frog/src')
const shim = (p: string) => path.join(root, 'shims', p)
const adapter = (p: string) => path.join(root, 'src/upstream-adapter', p)
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\?.*$/, '')
const upstream = (p: string) => norm(path.join(upstreamSrc, p))

/** 上游模块（解析后的绝对路径，不含扩展名）→ 替代模块。 */
const MODULE_SWAPS: Record<string, string> = {
  'components/llm-providers/use-hosted-ai-status': shim('use-hosted-ai-status.ts'),
  'env/index': shim('env.ts'),
  'utils/error-action': shim('error-action.ts'),
  'utils/host/translate/api/google': shim('removed-free-translate.ts'),
  'utils/host/translate/api/google-legacy': shim('removed-free-translate.ts'),
  'utils/host/translate/api/microsoft': shim('removed-free-translate.ts'),
  'utils/layout-host/slots': shim('layout-host-slots.ts'),
  'utils/logo': shim('logo.ts'),
}

function upstreamModuleSwap(): Plugin {
  const swaps = new Map(Object.entries(MODULE_SWAPS).map(([k, v]) => [upstream(k), v]))
  return {
    name: 'hongyi:upstream-module-swap',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !norm(importer).startsWith(norm(upstreamSrc))) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved) return null
      const target = swaps.get(norm(resolved.id).replace(/\.(tsx?|jsx?)$/, ''))
      return target ?? null
    },
  }
}
/** 上游资源 → 本地通用图标：不打包预置商业 provider 与 Read Frog 品牌图（决策 L4）。 */
const genericLogo = path.join(upstreamSrc, 'assets/providers/custom-provider.svg')
const ASSET_SWAPS = ['jalapeno-cloud.png', 'tensdaq-color.svg', 'read-frog-provider.png']
for (const name of ASSET_SWAPS) MODULE_SWAPS[`assets/providers/${name}`] = genericLogo

/** 专有或无许可的包不得进入构建（决策 L1、L2）；只出现在 `import type` 里的会在转译时擦除，不会走到这里。 */
const BANNED_PACKAGES = /^(@read-frog\/(api-contract|layout-engine)|better-auth|@orpc\/)/

function bannedPackageGuard(): Plugin {
  return {
    name: 'hongyi:banned-package-guard',
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (!BANNED_PACKAGES.test(source)) return null
      // dev 依赖扫描不跑 transform，读到的是未经 upstreamSourcePatch 的原始源码，会看到已被补丁去掉的导入
      // （没有 node_modules/.vite 缓存或缓存失效时才扫描，所以表现为偶发）。扫描只决定预打包哪些依赖，
      // 这里标成外部依赖跳过；build、dev、SSR 的真正转译仍然报错。scan 是 Vite 运行时传入、未写进公开类型的字段。
      if ((options as { scan?: boolean }).scan) return { id: source, external: true }
      this.error(`banned package "${source}" imported by ${importer}`)
    },
  }
}
interface SourcePatch {
  /** 匹配到的次数必须等于 count，否则构建失败（上游改了这段代码，要重新核对）。 */
  count: number
  find: string | RegExp
  replace: string
}

const PROVIDER_FETCH = `fetch: __hongyiFetchForProvider(matchedConfig.id, matchedConfig.baseURL ?? matchedConfig.url),`
const ownSrc = norm(path.relative(path.join(upstreamSrc, 'assets/styles'), path.join(root, 'src')))
const TAILWIND_OWN_SOURCES = [
  `@source "${ownSrc}/**/*.{ts,tsx}";`,
  `@source not "${ownSrc}/**/__tests__";`,
  `@source not "${ownSrc}/**/*.test.*";`,
].join('\n')
const IMPORT_TEXT_FORMAT ='import type { TranslationTextFormat } from "@/types/config/translate"'
const IMPORT_PURE_API_FETCH = `import { pureApiFetch as __hongyiPureApiFetch, deeplBaseURL as __hongyiDeeplBaseURL } from "${norm(adapter('pure-api-fetch.ts'))}"`
const IMPORT_TTS_AVAILABLE = `import { TTS_AVAILABLE } from "${norm(adapter('tts.ts'))}"`
/** 自定义端点原来指向 Read Frog 网站的文档（WXT_WEBSITE_URL 为空时变成相对路径），改指协议自己的站点。 */
const OWN_WEBSITE: Array<[string, string]> = [
  ['name: "Custom Chat Complete",', 'https://platform.openai.com/docs/api-reference/chat'],
  ['name: "Custom Responses",', 'https://www.openresponses.org/'],
]
const SOURCE_PATCHES: Record<string, SourcePatch[]> = {
  // Tailwind 只扫描 source("../..")（= upstream/read-frog/src）；加上本工程 src/，测试文件除外。
  // @source 必须和 @import "tailwindcss" 在同一份样式表里才生效，所以补在上游 theme.css 上，而不是另起一个 CSS 入口。
  'assets/styles/theme.css': [
    { count: 1, find: '@import "tailwindcss" source("../..");', replace: `@import "tailwindcss" source("../..");\n${TAILWIND_OWN_SOURCES}` },
  ],
  // AI SDK provider 注入 fetch：utools.ai 虚拟端点 / preload 桥接（方案「不替换全局 fetch」）。
  'utils/providers/model.ts': [
    { count: 1, find: 'import { match } from "ts-pattern"', replace: `import { match } from "ts-pattern"\nimport { fetchForProvider as __hongyiFetchForProvider } from "${norm(adapter('provider-fetch.ts'))}"` },
    { count: 3, find: /(\n {6}(?:createOpenAICompatible|createOpenResponses|DEDICATED_PROVIDER_FACTORY_BY_TYPE\[matchedConfig\.provider\])\(\{\n)/g, replace: `$1        ${PROVIDER_FETCH}\n` },
  ],
  // 默认 provider 列表：utools.ai 预置为默认引擎，去掉 Google/Microsoft 与商业预置。
  'utils/constants/providers.ts': [
    { count: 1, find: /export const DEFAULT_PROVIDER_CONFIG_LIST: ProvidersConfig = \[\n(?: {2}DEFAULT_PROVIDER_CONFIG[^\n]*\n)+\]/, replace: `export const DEFAULT_PROVIDER_CONFIG_LIST: ProvidersConfig = __hongyiBuildDefaultProviderList(DEFAULT_PROVIDER_CONFIG)` },
    { count: 1, find: 'import { camelCase } from "case-anything"', replace: `import { camelCase } from "case-anything"\nimport { buildDefaultProviderList as __hongyiBuildDefaultProviderList } from "${norm(adapter('default-providers.ts'))}"` },
    ...OWN_WEBSITE.map(([name, url]) => ({
      count: 1,
      find: `${name}\n    website: \`\${env.WXT_WEBSITE_URL}/docs/providers/openai-compatible-providers\`,`,
      replace: `${name}\n    website: ${JSON.stringify(url)},`,
    })),
  ],
  // DEFAULT_CONFIG：各翻译功能默认用 utools.ai；DEFAULT_LAYOUT 引用改为明确失败。
  'utils/constants/config.ts': [
    { count: 1, find: 'import { DEFAULT_LAYOUT } from "@read-frog/layout-engine/presets"', replace: `import { layoutEngineRemoved as __hongyiLayoutEngineRemoved } from "${norm(adapter('layout-removed.ts'))}"\nimport { UTOOLS_AI_PROVIDER_ID as __hongyiUtoolsAiProviderId } from "${norm(adapter('default-providers.ts'))}"` },
    { count: 1, find: '?? DEFAULT_LAYOUT', replace: '?? __hongyiLayoutEngineRemoved()' },
    { count: 4, find: 'providerId: MICROSOFT_TRANSLATE_PROVIDER_ID,', replace: 'providerId: __hongyiUtoolsAiProviderId,' },
    // 生词建议默认指向 OpenAI；我方默认关闭 OpenAI（无 key），留着会让默认配置过不了 configSchema。
    { count: 1, find: 'providerId: DEFAULT_PROVIDER_CONFIG.openai.id,', replace: 'providerId: __hongyiUtoolsAiProviderId,' },
    // 内置划词动作默认指向托管 AI；托管 AI 已从 provider 列表移除，改指 utools.ai，否则默认配置过不了 configSchema。
    { count: 6, find: 'providerId: BUILT_IN_AI_PROVIDER_ID,', replace: 'providerId: __hongyiUtoolsAiProviderId,' },
  ],
  'utils/constants/custom-action-templates.ts': [
    { count: 1, find: 'import { DEFAULT_LAYOUT } from "@read-frog/layout-engine/presets"', replace: `import { layoutEngineRemoved as __hongyiLayoutEngineRemoved } from "${norm(adapter('layout-removed.ts'))}"` },
    { count: 3, find: '?? DEFAULT_LAYOUT,', replace: '?? __hongyiLayoutEngineRemoved(),' },
    { count: 1, find: 'layout: DEFAULT_LAYOUT,', replace: 'layout: __hongyiLayoutEngineRemoved(),' },
  ],
  // 输出字段类型枚举原取自无许可的 api-contract；改取我方依据上游 GPL 源码定义的同值枚举。
  'types/config/selection-toolbar.ts': [
    { count: 1, find: 'import { HostedAiOutputFieldTypeSchema } from "@read-frog/api-contract"', replace: `import { HostedAiOutputFieldTypeSchema } from "${norm(adapter('output-field-type.ts'))}"\nimport { UTOOLS_AI_PROVIDER_ID as __hongyiUtoolsAiProviderId } from "${norm(adapter('default-providers.ts'))}"` },
    // 托管 AI 已从 provider 列表移除（见 provider-registry.ts 补丁）；schema 默认值改指 utools.ai，否则默认配置不合法。
    { count: 2, find: 'providerId: BUILT_IN_AI_PROVIDER_ID,', replace: 'providerId: __hongyiUtoolsAiProviderId,' },
  ],
  // 托管 AI（read-frog-free-ai / advance）从 provider 列表、选择器、配置校验里整体移除，而不只是灰显。
  'utils/providers/provider-registry.ts': [
    { count: 1, find: 'return Object.values(SYSTEM_PROVIDER_DEFS)', replace: 'return []' },
  ],
  // DeepL / DeepLX 原来直接调全局 fetch：改走 preload 桥接（只发往已登记的 origin，key 占位符在 preload 里替换）。
  'utils/host/translate/api/deepl.ts': [
    { count: 1, find: IMPORT_TEXT_FORMAT, replace: `${IMPORT_TEXT_FORMAT}\n${IMPORT_PURE_API_FETCH}` },
    { count: 1, find: 'const baseURL = getDeepLBaseURL(apiKey)', replace: 'const baseURL = __hongyiDeeplBaseURL(providerConfig.baseURL, apiKey, getDeepLBaseURL)' },
    { count: 1, find: 'await fetchDirect(url, apiKey, requestBody, options?.signal)', replace: 'await fetchDirect(url, apiKey, requestBody, options?.signal, providerConfig.id)' },
    { count: 1, find: '  signal?: AbortSignal,\n): Promise<Response> {\n  const resp = await fetch(url, {', replace: '  signal?: AbortSignal,\n  __hongyiProviderId?: string,\n): Promise<Response> {\n  const resp = await __hongyiPureApiFetch(__hongyiProviderId!)(url, {' },
  ],
  'utils/host/translate/api/deeplx.ts': [
    { count: 1, find: IMPORT_TEXT_FORMAT, replace: `${IMPORT_TEXT_FORMAT}\n${IMPORT_PURE_API_FETCH}` },
    { count: 1, find: 'await fetchDirect(url, requestBody, options?.signal)', replace: 'await fetchDirect(url, requestBody, options?.signal, providerConfig.id)' },
    { count: 1, find: 'async function fetchDirect(url: string, body: string, signal?: AbortSignal) {\n  const resp = await fetch(url, {', replace: 'async function fetchDirect(url: string, body: string, signal?: AbortSignal, __hongyiProviderId?: string) {\n  const resp = await __hongyiPureApiFetch(__hongyiProviderId!)(url, {' },
  ],
  // 服务下拉的设置按钮：不开扩展选项页，派发 OPEN_VIEW_EVENT 让入口层切到设置视图。
  'entrypoints/translation-hub/components/translation-service-dropdown.tsx': [
    { count: 1, find: 'import { selectedProviderIdsAtom } from "../atoms"', replace: `import { selectedProviderIdsAtom } from "../atoms"\nimport { openSettingsView as __hongyiOpenSettingsView } from "${norm(adapter('open-view.ts'))}"` },
    { count: 1, find: 'await browser.tabs.create({\n        url: browser.runtime.getURL("/options.html#/api-providers"),\n      })', replace: '__hongyiOpenSettingsView()' },
  ],
  // 朗读按钮：上游走 Edge TTS（微软非官方接口，经后台消息），uTools 版不接入，按钮不渲染。
  'entrypoints/translation-hub/components/text-input.tsx': [
    { count: 1, find: '        <Button\n          variant="ghost"\n          size="icon-sm"\n          onClick={handleSpeak}', replace: '        {TTS_AVAILABLE && <Button\n          variant="ghost"\n          size="icon-sm"\n          onClick={handleSpeak}' },
    { count: 1, find: '        </Button>\n        <Button onClick={handleTranslate}', replace: '        </Button>}\n        <Button onClick={handleTranslate}' },
    { count: 1, find: 'import { getHubPromptConfig } from "../prompt"', replace: `import { getHubPromptConfig } from "../prompt"\n${IMPORT_TTS_AVAILABLE}` },
  ],
  // 术语表的网址范围：uTools 里没有网页，快照一律按 url undefined 建（只有 matchPatterns 为空的术语表生效），
  // 不会调到 urlMatchesPattern；url-pattern.ts 依赖未安装的 @webext-core/match-patterns，换成恒不匹配。
  'utils/glossary/scope.ts': [
    { count: 1, find: 'import { urlMatchesPattern } from "../url-pattern"', replace: 'const urlMatchesPattern = (_url: string, _pattern: string): boolean => false' },
  ],
  'entrypoints/translation-hub/components/translation-card.tsx': [
    { count: 1, find: '{mutation.data && !mutation.isPending && (\n            <Button\n              variant="ghost"\n              size="icon"\n              onClick={handleSpeak}', replace: '{TTS_AVAILABLE && mutation.data && !mutation.isPending && (\n            <Button\n              variant="ghost"\n              size="icon"\n              onClick={handleSpeak}' },
    { count: 1, find: 'import { useTextToSpeech } from "@/hooks/use-text-to-speech"', replace: `import { useTextToSpeech } from "@/hooks/use-text-to-speech"\n${IMPORT_TTS_AVAILABLE}` },
  ],
  // WXT_WEBSITE_URL 为空：自定义端点的「官网」改指协议自己的站点，配置教程链接（Read Frog 网站）不显示。
  'entrypoints/options/pages/api-providers/providers-config/provider-config-form/config-header.tsx': [
    { count: 1, find: 'return `${env.WXT_WEBSITE_URL}/docs/providers/${providerType}`', replace: 'return undefined' },
    { count: 1, find: 'return `${env.WXT_WEBSITE_URL}/docs/providers/${groupSlug}`', replace: 'return undefined' },
  ],
}
function upstreamSourcePatch(): Plugin {
  const patches = new Map(Object.entries(SOURCE_PATCHES).map(([k, v]) => [upstream(k), v]))
  return {
    name: 'hongyi:upstream-source-patch',
    enforce: 'pre',
    transform(code, id) {
      const list = patches.get(norm(id))
      if (!list) return null
      let out = code
      for (const { count, find, replace } of list) {
        const hits = typeof find === 'string' ? out.split(find).length - 1 : (out.match(find) ?? []).length
        if (hits !== count) this.error(`source patch for ${id} expected ${count} match(es) of ${String(find)}, found ${hits}`)
        out = typeof find === 'string' ? out.split(find).join(replace) : out.replace(find, replace)
      }
      return { code: out, map: null }
    },
  }
}

/**
 * 上游 10 个 locale yml 共 60 处文案提到 readfrog.app（登录、Notebase、联系邮箱、提示词文档链接），
 * 都属于不接入的账号/云端功能。构建期在 yml 文本里把域名换成 RFC 2606 保留的 .invalid 名，不连也不指向 readfrog.app。
 */
function neutralizeLocaleDomain(): Plugin {
  const localeDir = `${norm(upstreamSrc)}/locales/`
  return {
    name: 'hongyi:neutralize-locale-domain',
    enforce: 'pre',
    transform(code, id) {
      if (!norm(id).startsWith(localeDir) || !norm(id).endsWith('.yml')) return null
      return { code: code.replace(/readfrog\.app/g, 'read-frog-cloud.invalid'), map: null }
    },
  }
}

/** public/ 原样拷进 dist；W2 的 preload 测试目录不进发布包。 */
function dropPublicTests(): Plugin {
  return {
    name: 'hongyi:drop-public-tests',
    apply: 'build',
    async writeBundle(options) {
      const { rm } = await import('node:fs/promises')
      await rm(path.join(options.dir ?? 'dist', 'preload/__tests__'), { recursive: true, force: true })
    },
  }
}

/**
 * public/plugin.json 的 development.main 指向 dev server，只给开发期用；uTools 只要看到这个字段就去连它，
 * 选 dist/plugin.json 加载时没开 dev server 会一直超时。发布包里去掉 development，其余字段不变。
 */
function stripDevelopmentManifest(): Plugin {
  return {
    name: 'hongyi:strip-development-manifest',
    apply: 'build',
    async writeBundle(options) {
      const { readFile, writeFile } = await import('node:fs/promises')
      const file = path.join(options.dir ?? 'dist', 'plugin.json')
      const manifest = JSON.parse(await readFile(file, 'utf8'))
      delete manifest.development
      // 发布构建（scripts/build-release.mjs 设 VITE_HONGYI_RELEASE=1）：去掉只给开发用的「洪译实测」入口。
      if (process.env.VITE_HONGYI_RELEASE === '1') manifest.features = stripFeatures(manifest, ['probe']).features
      await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`)
    },
  }
}
export default defineConfig(async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const tailwind = (await import('@tailwindcss/postcss')).default
  const autoprefixer = (await import('autoprefixer')).default
  const remToPx = (await import('postcss-rem-to-responsive-pixel')).default
  // 上游 postcss.config.cjs 的等价配置：--tw- → --rf-tw- 改名，rem → px。
  const renameCustomProps = require(path.join(upstreamSrc, 'utils/styles/postcss-rename-custom-props.cjs'))

  return {
    base: './',
    // 上游 tsconfig.json 继承 WXT 生成的 .wxt/tsconfig.json（未生成），所有文件统一用本工程的。
    tsconfig: path.join(root, 'tsconfig.json'),
    plugins: [
      bannedPackageGuard(),
      upstreamModuleSwap(),
      upstreamSourcePatch(),
      neutralizeLocaleDomain(),
      ViteYaml(),
      react(),
      dropPublicTests(),
      stripDevelopmentManifest(),
    ],
    resolve: {
      alias: [
        { find: /^#imports$/, replacement: shim('wxt-imports/index.ts') },
        { find: /^@webext-core\/messaging$/, replacement: shim('webext-messaging.ts') },
        { find: /^@iconify\/react$/, replacement: shim('iconify-react.tsx') },
        { find: /^@read-frog\/definitions$/, replacement: shim('read-frog-definitions/index.ts') },
        { find: /^shadcn\/tailwind\.css$/, replacement: shim('shadcn/tailwind.css') },
        { find: /^@\//, replacement: `${norm(upstreamSrc)}/` },
      ],
    },
    define: {
      'import.meta.env.BROWSER': JSON.stringify('chrome'),
      'import.meta.env.WXT_SKIP_ENV_VALIDATION': JSON.stringify('true'),
      'import.meta.env.WXT_EDGE_TTS_HTTP_ENABLED': JSON.stringify('false'),
    },
    css: {
      postcss: {
        plugins: [
          tailwind(),
          renameCustomProps({ fromPrefix: '--tw-', toPrefix: '--rf-tw-' }),
          autoprefixer(),
          remToPx({ rootValue: 16, propList: ['*'], transformUnit: 'px' }),
        ],
      },
    },
    // dev 依赖扫描：默认会把 upstream 里扩展的 index.html 都当入口；只扫本工程入口，并沿用本工程 tsconfig。
    optimizeDeps: {
      entries: ['index.html'],
      rolldownOptions: { tsconfig: path.join(root, 'tsconfig.json') },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 4096 },
    server: { port: 5173, strictPort: true },
  }
})
