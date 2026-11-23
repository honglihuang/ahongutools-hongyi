import fs from 'node:fs'
import path from 'node:path'
import { collectLicenses } from './audit-dist.mjs'

// 使用锁文件生成保守清单（含未被打包的生产依赖）。只输出公开的包元数据，不写构建机路径。
export function writeReleaseLicenses(root, dist) {
  const { error, packages } = collectLicenses(root)
  if (error) throw new Error(error)
  const lines = [
    fs.readFileSync(path.join(root, 'NOTICE'), 'utf8').trimEnd(),
    '', '第三方生产依赖清单（包含未进入构建的依赖）', '--------------------------------------------',
    ...packages.map(({ name, version, license }) => `${name}@${version}: ${license ?? '未声明'}`),
    '', '第三方许可与版权声明原文', '------------------------',
  ]
  for (const dep of packages) {
    const directory = path.join(root, dep.path)
    if (!fs.existsSync(directory)) continue
    const files = fs.readdirSync(directory, { withFileTypes: true }).filter((file) =>
      file.isFile() && /^(licen[cs]e|copying|notice|copyright|ofl)([._-].*|$)/i.test(file.name))
    // 这两个发布 tarball 不附许可文件，补上与锁定版本对应的上游原文。
    if (!files.length && dep.name === 'franc' && dep.version === '6.2.0') {
      lines.push('', '--- franc@6.2.0 / license ---',
        'https://github.com/wooorm/franc/blob/4b17eaccaa256bb57c46d02414925eb272c3b565/license', '',
        fs.readFileSync(path.join(root, 'licenses/franc-6.2.0.txt'), 'utf8').trimEnd())
    }
    if (!files.length && dep.name === '@ai-sdk/provider-utils' && dep.version === '5.0.74') {
      lines.push('', '--- @ai-sdk/provider-utils@5.0.74 / LICENSE ---',
        'https://github.com/vercel/ai/blob/2feaeecbd6a921a27123aafa75db6af34e1f246b/LICENSE', '',
        fs.readFileSync(path.join(root, 'node_modules/ai/LICENSE'), 'utf8').trimEnd())
    }
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push('', `--- ${dep.name}@${dep.version} / ${file.name} ---`, '',
        fs.readFileSync(path.join(directory, file.name), 'utf8').trimEnd())
    }
  }
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE'))
  fs.writeFileSync(path.join(dist, 'NOTICE'), `${lines.join('\n')}\n`)
}
