# 上游跟踪

| 项 | 值 |
| --- | --- |
| 上游仓库 | https://github.com/mengxi-ream/read-frog |
| 本地位置 | `upstream/read-frog`（git submodule） |
| 固定 commit | 96083134b111e56762f578b143bcd48e85058ba3 |
| 对应版本 | v1.55.0（上游 `package.json`），提交日期 2026-11-02 |
| 上游许可 | GPL-3.0（上游根目录 `LICENSE`） |

`scripts/check-upstream.mjs` 默认从上面「固定 commit」一行读取旧 commit，改动这一行时保持 40 位完整哈希。

## 同步流程

1. 更新 submodule 到目标 commit：
   ```
   git -C upstream/read-frog fetch origin
   git -C upstream/read-frog checkout <新 commit>
   ```
2. 检查耦合点变化（旧 = 本文件的固定 commit，新 = submodule 当前 HEAD）：
   ```
   node scripts/check-upstream.mjs
   ```
   退出码 1 表示有新增的消息 key、`browser.*`/`chrome.*` 调用、`import.meta.env.*`、
   `#imports`/`wxt`/`@webext-core/*`/`@read-frog/*` 导入。逐项在 shim、消息总线或补丁里处理，
   处理完再继续。没有 submodule 时用 `--repo <本地克隆>`。
3. 如有补丁，在新 commit 上重新应用，并更新下方补丁清单。
4. 构建：`npm ci && npm run build`。
5. 审计发布包：`node scripts/audit-dist.mjs`，必须退出码 0；检查 `reports/dist-licenses.json` 的新增依赖。
6. 更新本文件：固定 commit、对应版本、补丁清单；在 `NOTICE` 的修改记录里补一行。
7. 提交时把 submodule 指针、本文件、`NOTICE` 放在同一个提交里。

## 补丁清单

submodule 指向上游原始 commit，不改 submodule 里的文件。所有改动都是构建期补丁，定义在 `vite.config.ts`：

- 源码补丁（`SOURCE_PATCHES`，transform 钩子）：按字符串或正则替换上游个别语句。每条都写了期望命中次数，
  次数不符就构建失败，同步上游后要逐条核对。
- 整模块替换（`MODULE_SWAPS`，resolveId 钩子）：上游模块按解析后的绝对路径换成 `shims/` 下的替代实现。
- 包级别名（`resolve.alias`）：`#imports`、`@webext-core/messaging`、`@iconify/react`、`@read-frog/definitions`、
  `shadcn/tailwind.css` 换成 `shims/` 下的实现。
- 文案：上游 `locales/*.yml` 里的 `readfrog.app` 换成 `read-frog-cloud.invalid`（`neutralizeLocaleDomain`）。

### 源码补丁

路径相对 `upstream/read-frog/src/`。

| # | 上游文件 | 位置（替换的语句） | 目的 | 引入 |
| --- | --- | --- | --- | --- |
| 1 | `utils/providers/model.ts` | 3 处 provider 工厂调用的参数对象开头 | 注入 `fetch: fetchForProvider(...)`：utools.ai 走虚拟端点，其余走 preload 桥接，不替换全局 fetch | 第一阶段 |
| 2 | `utils/constants/providers.ts` | `DEFAULT_PROVIDER_CONFIG_LIST` 数组 | 默认 provider 改为 utools.ai + 默认关闭的 OpenAI、DeepSeek，去掉 Google/Microsoft 与商业预置 | 第一阶段 |
| 3 | `utils/constants/providers.ts` | `PROVIDER_ITEMS` 中 Custom Chat Complete、Custom Responses 的 `website` | 原来拼 `WXT_WEBSITE_URL` 的 Read Frog 文档地址（为空时成相对路径），改指协议自己的站点 | 第二阶段 |
| 4 | `utils/constants/config.ts` | `@read-frog/layout-engine/presets` 导入与 `?? DEFAULT_LAYOUT` | 专有 layout-engine 不打包，引用处改为明确失败 | 第一阶段 |
| 5 | `utils/constants/config.ts` | 4 处 `MICROSOFT_TRANSLATE_PROVIDER_ID`、1 处 `DEFAULT_PROVIDER_CONFIG.openai.id` | 各功能默认引擎改为 utools.ai，默认配置能通过 configSchema | 第一阶段 |
| 6 | `utils/constants/config.ts` | 6 处 `providerId: BUILT_IN_AI_PROVIDER_ID,` | 内置划词动作默认引擎改为 utools.ai（托管 AI 已移除，见 #10） | 第二阶段 |
| 7 | `utils/constants/custom-action-templates.ts` | layout-engine 导入与 4 处 `DEFAULT_LAYOUT` | 同 #4 | 第一阶段 |
| 8 | `types/config/selection-toolbar.ts` | `@read-frog/api-contract` 导入 | 输出字段类型枚举改取 `src/upstream-adapter/output-field-type.ts` | 第一阶段 |
| 9 | `types/config/selection-toolbar.ts` | schema 默认值里 2 处 `BUILT_IN_AI_PROVIDER_ID` | 同 #6 | 第二阶段 |
| 10 | `utils/providers/provider-registry.ts` | `getSystemProviderDefs()` 的返回值 | 托管 AI（read-frog-free-ai / advance）从列表、选择器、配置校验里移除，而不只是灰显 | 第二阶段 |
| 11 | `utils/host/translate/api/deepl.ts` | `fetchDirect` 里的全局 `fetch`；`getDeepLBaseURL(apiKey)` | 请求走 preload 桥接（`src/upstream-adapter/pure-api-fetch.ts`）；key 只有占位符，端点按配置的 baseURL 取，没配时沿用上游判断 | 第二阶段 |
| 12 | `utils/host/translate/api/deeplx.ts` | `fetchDirect` 里的全局 `fetch` | 请求走 preload 桥接；`{{apiKey}}` 拼进 URL 的写法明确失败 | 第二阶段 |
| 13 | `entrypoints/translation-hub/components/translation-service-dropdown.tsx` | 设置按钮的 `browser.tabs.create(...)` | 改为派发 `OPEN_VIEW_EVENT`（detail `settings`），入口层切到设置视图 | 第二阶段 |
| 14 | `entrypoints/translation-hub/components/text-input.tsx` | 朗读按钮 | 加 `TTS_AVAILABLE &&`（false）：Edge TTS 是微软非官方接口，不接入，按钮不渲染 | 第二阶段 |
| 15 | `entrypoints/translation-hub/components/translation-card.tsx` | 朗读按钮 | 同 #14 | 第二阶段 |
| 16 | `entrypoints/options/pages/api-providers/providers-config/provider-config-form/config-header.tsx` | `getHowToConfigureURL` 两处返回值 | 配置教程链接指向 Read Frog 网站，改为不显示 | 第二阶段 |
| 17 | `assets/styles/theme.css` | `@import "tailwindcss" source("../..");` 之后 | 加 `@source` 本工程 `src/**/*.{ts,tsx}`（排除 `__tests__`、`*.test.*`），只在我方代码里用到的 utility class 才会生成 | 第二阶段 |

### 整模块替换

| 上游模块 | 替代 | 目的 | 引入 |
| --- | --- | --- | --- |
| `components/llm-providers/use-hosted-ai-status` | `shims/use-hosted-ai-status.ts` | 不经 better-auth / oRPC 访问 readfrog.app | 第一阶段 |
| `env/index` | `shims/env.ts` | 云端地址置空 | 第一阶段 |
| `utils/error-action` | `shims/error-action.ts` | 定价、登录、账单链接一律不给（原实现在 `WXT_WEBSITE_URL` 为空时 `new URL` 抛错） | 第二阶段 |
| `utils/host/translate/api/google`、`google-legacy`、`microsoft` | `shims/removed-free-translate.ts` | 删除非官方免 key 接口 | 第一阶段 |
| `utils/layout-host/slots` | `shims/layout-host-slots.ts` | layout-engine 不打包，调用明确失败 | 第一阶段 |
| `utils/logo` | `shims/logo.ts` | 不加载 lobehub 图标 CDN | 第一阶段 |
| `assets/providers/jalapeno-cloud.png`、`tensdaq-color.svg`、`read-frog-provider.png` | 上游 `custom-provider.svg` | 不打包商业预置与 Read Frog 品牌图 | 第一阶段 |
