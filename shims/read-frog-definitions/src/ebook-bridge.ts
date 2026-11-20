// 电子书页面与扩展之间的 postMessage 协议。名字与形状按 @read-frog/definitions@0.12.0 的 d.ts 对齐，实现为本包自写。
import { z } from 'zod'

export const EBOOK_SELECTION_BRIDGE_PROTOCOL_VERSION = 1
export const EBOOK_BRIDGE_PAGE_SOURCE = 'read-frog-page'
export const EBOOK_BRIDGE_EXTENSION_SOURCE = 'read-frog-ext'
export const EBOOK_SECTION_DOCUMENT_ATTRIBUTE = 'data-read-frog-ebook-section'
export const EBOOK_BRIDGE_HANDSHAKE_TYPE = 'ebookBridgeHandshake'
export const EBOOK_BRIDGE_SELECTION_CHANGED_TYPE = 'ebookSelectionChanged'
export const EBOOK_BRIDGE_SELECTION_CLEARED_TYPE = 'ebookSelectionCleared'

const directionSchema = z.enum(['bottom-left', 'bottom-right', 'top-left', 'top-right'])
export type EbookBridgeSelectionDirection = z.infer<typeof directionSchema>

const selectionPayloadSchema = z.strictObject({
  requestId: z.string(),
  text: z.string(),
  contextParagraphs: z.array(z.string()),
  rect: z.strictObject({ top: z.number(), left: z.number(), width: z.number(), height: z.number() }),
  anchor: z.strictObject({ x: z.number(), y: z.number() }),
  direction: directionSchema,
  bookTitle: z.string().optional(),
})
export type EbookBridgeSelectionPayload = z.infer<typeof selectionPayloadSchema>

const pageSource = z.literal(EBOOK_BRIDGE_PAGE_SOURCE)
export const ebookBridgePageMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ source: pageSource, protocolVersion: z.number(), type: z.literal(EBOOK_BRIDGE_HANDSHAKE_TYPE) }),
  z.strictObject({
    source: pageSource,
    protocolVersion: z.number(),
    type: z.literal(EBOOK_BRIDGE_SELECTION_CHANGED_TYPE),
    data: selectionPayloadSchema,
  }),
  z.strictObject({ source: pageSource, protocolVersion: z.number(), type: z.literal(EBOOK_BRIDGE_SELECTION_CLEARED_TYPE) }),
])

const extensionHandshakeSchema = z.strictObject({
  source: z.literal(EBOOK_BRIDGE_EXTENSION_SOURCE),
  type: z.literal(EBOOK_BRIDGE_HANDSHAKE_TYPE),
  protocolVersion: z.number(),
  data: z.strictObject({ extensionVersion: z.string() }),
})
export type EbookBridgeExtensionHandshake = z.infer<typeof extensionHandshakeSchema>
