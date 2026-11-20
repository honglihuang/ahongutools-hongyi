// 关于：插件名、版本、来源与许可（决策 L3）、key 存放说明（决策 S1）。
import pkg from '../../package.json'
import { ConfigItem, ConfigSection, Note } from './ui.tsx'

const UPSTREAM_URL = 'https://github.com/mengxi-ream/read-frog'
const VERSION = (pkg as { version?: string }).version ?? '开发版'
// 公开仓库按版本打 tag（v<version>），关于页链到与当前版本对应的源码。
const SOURCE_URL = `https://github.com/honglihuang/ahongutools-hongyi/tree/v${VERSION}`

function ExternalLink({ href }: { href: string }) {
  return (
    <a
      className="break-all text-primary underline underline-offset-2"
      href={href}
      onClick={(e) => {
        e.preventDefault()
        void window.utools.shellOpenExternal(href)
      }}
    >
      {href}
    </a>
  )
}

export function AboutSection() {
  return (
    <ConfigSection title="关于">
      <ConfigItem title="洪译" description={`版本 ${VERSION}`}>
        <span />
      </ConfigItem>
      <ConfigItem title="来源与许可" orientation="vertical">
        <div className="flex flex-col gap-2 text-[13px] leading-[18px] text-muted-foreground">
          <p>基于 Read Frog（GPL-3.0）修改，整个插件以 GPL-3.0 发布，不提供任何担保（见 LICENSE 第 15、16 条）。</p>
          <p>
            源码：<ExternalLink href={SOURCE_URL} />
          </p>
          <p>
            上游项目：<ExternalLink href={UPSTREAM_URL} />（commit 9608313，v1.55.0）
          </p>
          <ul className="list-disc pl-5">
            <li>本插件不使用 Read Frog、陆读的名称和 logo；提及 Read Frog 仅用于说明代码来源，不表示由其开发、认可或支持。</li>
            <li>不包含 Read Frog 的专有或未授权组件；Read Frog 账号与云端功能已删除。</li>
            <li>删除了 Google、Microsoft 非官方免 key 翻译接口；新增 uTools AI 引擎与本机网络、存储桥接。</li>
            <li>第三方依赖各自保留原有许可，详见随插件发布的 NOTICE 与 LICENSE。</li>
          </ul>
        </div>
      </ConfigItem>
      <ConfigItem title="API key 存放" orientation="vertical">
        <Note>
          你填写的 API key 以明文保存在本机的插件数据目录里，不随 uTools 同步，也不会在设置页回显；同步的配置里只有占位符。
          请求只会发往保存 key 时填写的服务地址。key 加密存储会在后续版本提供。
        </Note>
      </ConfigItem>
    </ConfigSection>
  )
}
