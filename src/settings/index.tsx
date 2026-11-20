// 「洪译设置」视图（单页）。由入口层（P1）挂进路由；依赖入口层已提供的 Jotai（上游 configAtom）、i18n、主题与 Tooltip 等 Provider，
// 与 translation hub 同一套外壳。
import ActionsSettingsSection from '../actions/settings-section.tsx'
import type { ViewProps } from '../entry/contract.ts'
import GlossarySettingsSection from '../glossary/settings-section.tsx'
import { AboutSection } from './about-section.tsx'
import { EnginesSection } from './engines-section.tsx'
import { PrefsSections } from './prefs-sections.tsx'
import { ConfigSection } from './ui.tsx'
import { UtoolsAiSection } from './utools-ai-section.tsx'

export default function SettingsView(_props: ViewProps) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-6">
      <h1 className="text-lg font-semibold">洪译设置</h1>
      <ConfigSection title="翻译引擎">
        <EnginesSection />
      </ConfigSection>
      <ConfigSection title="uTools AI">
        <UtoolsAiSection />
      </ConfigSection>
      <ConfigSection title="术语表与背景说明">
        <GlossarySettingsSection />
      </ConfigSection>
      <ConfigSection title="AI 动作">
        <ActionsSettingsSection />
      </ConfigSection>
      <PrefsSections />
      <AboutSection />
    </main>
  )
}
