// 博客、电子书桥、Notebase、版本号、视频链接相关的 schema 与工具函数。
// 导出名与类型形状按 @read-frog/definitions@0.12.0 的 d.ts 对齐，实现为本包自写。
import { z } from 'zod'

// ---- 视频链接 ----
const BILIBILI_BVID = /^BV[0-9A-Za-z]{10}$/
const isBilibiliHost = (host: string) => host === 'bilibili.com' || host.endsWith('.bilibili.com')

export function getBilibiliVideoIdFromUrl(url: string | URL): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (!isBilibiliHost(parsed.hostname)) return null
  const fromPath = /\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/.exec(parsed.pathname)?.[1]
  const fromQuery = parsed.searchParams.get('bvid')
  const id = fromPath ?? fromQuery
  return id && BILIBILI_BVID.test(id) ? id : null
}

export const bilibiliVideoUrlSchema = z.url({ protocol: /^https?$/, hostname: /^(?:.+\.)?bilibili\.com$/ })

const YOUTUBE_ID = /^[\w-]+$/
const isYoutubeHost = (host: string) => host === 'youtube.com' || host.endsWith('.youtube.com')

/** YouTube 视频 ID：watch?v=、youtu.be/、/shorts/、/embed/、/live/；其他返回 null。 */
export function getVideoIdFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  let id: string | null | undefined
  if (parsed.hostname === 'youtu.be') id = parsed.pathname.split('/')[1]
  else if (isYoutubeHost(parsed.hostname)) {
    id = parsed.pathname === '/watch'
      ? parsed.searchParams.get('v')
      : /^\/(?:shorts|embed|live)\/([^/]+)/.exec(parsed.pathname)?.[1]
  }
  return id && YOUTUBE_ID.test(id) ? id : null
}

// ---- 博客 ----
const blogPostTypeSchema = z.enum(['promotion', 'update'])
export type BlogPostType = z.output<typeof blogPostTypeSchema>

const latestBlogPostSchema = z.object({
  date: z.string().pipe(z.coerce.date()),
  title: z.string(),
  description: z.string().optional(),
  url: z.string(),
  urlOverride: z.url().optional(),
  imageUrl: z.url().optional(),
  videoUrl: z.url().optional(),
  extensionVersion: z.string().optional(),
  type: blogPostTypeSchema.optional().catch(undefined),
})
export const latestBlogResponseSchema = latestBlogPostSchema.nullable()
export type LatestBlogPost = z.output<typeof latestBlogPostSchema>

// ---- 版本号 ----
export const semanticVersionSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'must be a semantic version like 1.2.3')

// ---- Notebase ----
const notebaseColumnConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('string') }),
  z.object({
    type: z.literal('number'),
    decimal: z.number().default(0),
    format: z.enum(['number', 'currency', 'percent']).default('number'),
  }),
  z.object({ type: z.literal('boolean') }),
  z.object({ type: z.literal('date'), dateFormat: z.string().optional() }),
  z.object({
    type: z.literal('select'),
    options: z.array(z.object({ id: z.string(), value: z.string(), color: z.string() })).default([]),
  }),
])
export type NotebaseColumnConfig = z.infer<typeof notebaseColumnConfigSchema>
type NotebaseColumnType = NotebaseColumnConfig['type']

export const NOTEBASE_COLUMN_TYPE_INFO: Record<NotebaseColumnType, { label: string, defaultConfig: NotebaseColumnConfig }> = {
  string: { label: 'Text', defaultConfig: { type: 'string' } },
  number: { label: 'Number', defaultConfig: { type: 'number', decimal: 0, format: 'number' } },
  boolean: { label: 'Checkbox', defaultConfig: { type: 'boolean' } },
  date: { label: 'Date', defaultConfig: { type: 'date' } },
  select: { label: 'Select', defaultConfig: { type: 'select', options: [] } },
}
