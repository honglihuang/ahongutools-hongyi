// uTools 主界面入口：上游 translation hub 的同一套 Provider 外壳，里面按 onPluginEnter 的 feature code 切换视图。
// 与上游 entrypoints/translation-hub/main.tsx 的组装相同，区别是：
// 1) 先注册本地消息处理器、跑 initializeConfig()（扩展里由 background 负责：迁移 + 写入默认配置）；
// 2) 去掉右下角的反馈按钮（HelpButton 指向上游 GitHub issues，洪译的反馈入口第二阶段再定）；
// 3) 渲染 ViewHost（src/entry/views/），所有视图共用这一层 Provider。
import type { Config } from '@/types/config/config'
import type { ThemeMode } from '@/types/config/theme'
import { QueryClientProvider } from '@tanstack/react-query'
import { Provider as JotaiProvider } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import * as React from 'react'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AnchoredToastProvider, ToastProvider } from '@/components/ui/base-ui/toast'
import { TooltipProvider } from '@/components/ui/base-ui/tooltip'
import { configAtom } from '@/utils/atoms/config'
import { baseThemeModeAtom } from '@/utils/atoms/theme'
import { initializeConfig } from '@/utils/config/init'
import { getLocalConfig } from '@/utils/config/storage'
import { DEFAULT_CONFIG } from '@/utils/constants/config'
import { initI18n } from '@/utils/i18n'
import { LocaleBoundary } from '@/utils/i18n/locale-boundary'
import { renderPersistentReactRoot } from '@/utils/react-root'
import { queryClient } from '@/utils/tanstack-query'
import { applyTheme, getLocalThemeMode, isDarkMode } from '@/utils/theme'
import * as actionsStartup from './actions/startup.ts'
import { registerEntryEvents } from './entry/events.ts'
import { ViewHost } from './entry/views/view-host.tsx'
import * as glossaryStartup from './glossary/startup.ts'
import { registerMessageHandlers } from './upstream-adapter/messages.ts'
import '@fontsource-variable/inter/index.css'
import '@/assets/styles/theme.css'

interface HydrateAtomsProps {
  initialValues: [[typeof configAtom, Config], [typeof baseThemeModeAtom, ThemeMode]]
  children: React.ReactNode
}

function HydrateAtoms({ initialValues, children }: HydrateAtomsProps) {
  useHydrateAtoms(initialValues)
  return children
}

// 第三阶段各工作流的启动与同步拉取钩子。各自单独捕获，一个失败不影响另一个，也不挡渲染。
const STARTUPS = [
  ['glossary', glossaryStartup],
  ['actions', actionsStartup],
] as const

function runHooks(hook: 'start' | 'onDbPull') {
  for (const [name, mod] of STARTUPS) {
    void mod[hook]().catch((error: unknown) => console.warn(`[hongyi] ${name}.${hook} 失败`, error))
  }
}

async function initApp() {
  const root = document.getElementById('root')!
  root.className = 'text-base antialiased min-h-screen bg-background'

  // 先于任何 await 注册：进入事件写进 nav 状态，ViewHost 挂载后读取，不会因初始化未完成而错过。
  registerEntryEvents(window.utools, window)
  registerMessageHandlers()
  await initializeConfig()

  // uTools 每个插件只保留一个 onDbPull 监听，统一在这里注册。
  runHooks('start')
  window.utools.onDbPull(() => runHooks('onDbPull'))

  const [configValue, themeMode] = await Promise.all([getLocalConfig(), getLocalThemeMode()])
  const config = configValue ?? DEFAULT_CONFIG

  await initI18n(config.uiLanguage)

  applyTheme(document.documentElement, isDarkMode(themeMode) ? 'dark' : 'light')

  renderPersistentReactRoot(
    root,
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>
          <HydrateAtoms
            initialValues={[
              [configAtom, config],
              [baseThemeModeAtom, themeMode],
            ]}
          >
            <ThemeProvider>
              <TooltipProvider>
                <LocaleBoundary>
                  <ToastProvider>
                    <AnchoredToastProvider>
                      <ViewHost />
                    </AnchoredToastProvider>
                  </ToastProvider>
                </LocaleBoundary>
              </TooltipProvider>
            </ThemeProvider>
          </HydrateAtoms>
        </JotaiProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  )
}

void initApp()
