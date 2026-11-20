# 来源与许可

本目录是 `@read-frog/definitions` 的本地替代实现，包名相同，导出的是上游 Read Frog（GPL-3.0）实际导入的那些名字。
原包 `@read-frog/definitions@0.12.0` 没有许可证（npm 上该版本的包里没有 LICENSE 文件，也没有 package.json 的 license 字段），所以本目录没有复制它的源码、数据表或实现。

## 和原包的关系

- 只看过原包 tarball 里的 `dist/index.d.ts`，用来对齐导出名和类型形状（名字、字面量常量、zod schema 的字段结构）。没有读取或复制 `src/`、`dist/index.js` 和其中的数据表。
- 导出名清单来自扫描上游 GPL 源码中的 `import … from "@read-frog/definitions"`。
- 所有函数和 schema 都是本包自写的。行为依据是上游 GPL 测试里的期望值（如 `src/utils/__tests__/blog.test.ts`、`src/utils/orpc/__tests__/client-context.test.ts`、`src/utils/content/__tests__/language-direction.test.ts`）。

## 每张表的来源

`src/languages.generated.ts` 由 `scripts/generate-languages.mjs` 生成，不要手改。

| 导出 | 来源 | 许可 |
| --- | --- | --- |
| `LANG_CODE_ISO6393_OPTIONS`（语言码列表及顺序）、`LANG_CODE_TO_EN_NAME`（英文名） | 上游 Read Frog 源码 `src/locales/en.yml` 的 `languages:` 段（键 `cmnHant` 对应 `cmn-Hant`）。语言码本身是 ISO 639-3 标识符 | GPL-3.0（上游仓库） |
| `ISO6393_TO_6391`、`LANG_CODE_ISO6391_OPTIONS`、`LOCALE_TO_ISO6393` | SIL ISO 639-3 官方码表 `iso-639-3.tab` 的 Part1 列和 `iso-639-3-macrolanguages.tab`（https://iso639-3.sil.org/code_tables/download_tables）。规则：取该码的 Part1；没有 Part1 的个体语言，只有当 CLDR 别名数据（`Intl.getCanonicalLocales`）也把它规范化成所属宏语言的 639-1 码时才采用宏语言的 Part1。`cmn-Hant` 固定映射为 `zh-TW`，因为上游 DeepL/DeepLX 适配代码按这个值识别繁体中文。`LOCALE_TO_ISO6393` 是前者的反查表，同一 639-1 码以列表中先出现的语言为准 | ISO 639-3 码表的使用条款：允许把码嵌入软件，需注明来源为 iso639-3.sil.org，不得修改码，不得在产品中提供码表再分发手段。本包只固化了 179 个码到 639-1 的映射，没有分发码表文件。生成时读取的 `.tab` 文件不进仓库 |
| `LANG_CODE_TO_LOCALE_NAME`（本地语言名） | `Intl.DisplayNames(<该语言>, { type: 'language' })`，数据来自 Node 内置 ICU 的 Unicode CLDR（生成环境的 ICU/CLDR 版本写在生成文件头部）。CLDR 没有该语言自己的本地名时，用英文名代替 | Unicode License v3（CLDR） |
| `RTL_LANG_CODES` | `new Intl.Locale(<该语言>).maximize()` 的 `textInfo.direction`（CLDR likely subtags + 书写系统方向） | Unicode License v3（CLDR） |
| `langCodeISO6393Schema` | 由 `LANG_CODE_ISO6393_OPTIONS` 生成的 `z.enum` | 本包代码 |
| `speechLanguageFromTag` | 基于上面几张表的自写解析（大小写、`_`/`-`、POSIX 编码后缀，`zh-*` 按 Hant/HK/MO/TW 区分繁简） | 本包代码 |

非语言导出（`src/app.ts`、`src/ebook-bridge.ts`、`src/schemas.ts`）只有字面量常量和自写的 schema/函数。常量值是原包 d.ts 里声明的字面量类型（如 `"read-frog-page"`），协议互通需要原值。这些常量服务于 Read Frog 账号、云 API、电子书桥、Notebase，uTools 插件不调用它们对应的服务。

## 重新生成

```sh
node scripts/generate-languages.mjs <上游 Read Frog 仓库目录> [iso-639-3.tab] [iso-639-3-macrolanguages.tab]
```

不传 `.tab` 路径时，脚本从 SIL 官方地址下载。不同 Node 版本的 ICU/CLDR 数据不同，生成的本地名可能有差异。

## 与原包已知的差异

- 639-1 映射按上面的规则推导，和原包有出入：原包的 `LANG_CODE_ISO6391_OPTIONS` 有 `ff`、`ku`、`ms`，本包没有（`fuv`、`ckb`、`zlm`、`min`、`bjn` 映射为 `undefined`）。本包多出 `rn`、`mg`、`za`、`ps`（SIL 码表或 CLDR 别名给出的 `run`、`plt`、`zyb`、`pbu` 的 639-1 码）。上游源码没有用到这些 639-1 字面量。
- 只实现上游导入的 48 个名字，原包的其他导出（计费、SRS、卡片模板、MCP 权限等）没有提供。
