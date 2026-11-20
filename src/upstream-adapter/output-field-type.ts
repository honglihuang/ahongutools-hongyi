// 只给 upstream types/config/selection-toolbar.ts 用（vite.config.ts 按导入方定向替换），不是 @read-frog/api-contract 的 shim。
// 上游从无许可的 api-contract 取「自定义动作输出字段类型」枚举，配置 schema 需要它来校验 config。
// 取值依据上游 GPL 源码：选项页 output-schema-field.tsx 为每个选项渲染 i18n `dataTypes.${type}`，
// 而 src/locales/*.yml 的 dataTypes 只有 string、number 两项；内置动作与迁移脚本也只用这两种。
import { z } from 'zod'

export const HostedAiOutputFieldTypeSchema = z.enum(['string', 'number'])
