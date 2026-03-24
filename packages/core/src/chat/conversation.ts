import type { ChatMessage } from '@openmnemo/types'

import { truncate } from '../transcript/common.js'

export interface CompressedConversation {
  recentMessages: ChatMessage[]
  summary?: string
  compressed: boolean
}

export interface CompressConversationOptions {
  keepRecentMessages?: number
  maxSummaryItems?: number
  summarySnippetLimit?: number
}

const DEFAULT_KEEP_RECENT_MESSAGES = 6
const DEFAULT_MAX_SUMMARY_ITEMS = 8
const DEFAULT_SUMMARY_SNIPPET_LIMIT = 160

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function summarizeMessageContent(value: string, limit: number): string {
  return truncate(normalizeWhitespace(value), limit)
}

function normalizeRecentLimit(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 2) {
    return DEFAULT_KEEP_RECENT_MESSAGES
  }
  return Math.floor(value)
}

function normalizeSummaryItems(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_MAX_SUMMARY_ITEMS
  }
  return Math.floor(value)
}

function normalizeSnippetLimit(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 40) {
    return DEFAULT_SUMMARY_SNIPPET_LIMIT
  }
  return Math.floor(value)
}

function buildSummary(
  messages: ChatMessage[],
  options: CompressConversationOptions,
): string | undefined {
  if (messages.length === 0) return undefined

  const maxSummaryItems = normalizeSummaryItems(options.maxSummaryItems)
  const snippetLimit = normalizeSnippetLimit(options.summarySnippetLimit)
  const selected = messages.slice(-maxSummaryItems)
  const omittedCount = messages.length - selected.length
  const lines = selected.map((message) =>
    `- ${message.role}: ${summarizeMessageContent(message.content, snippetLimit)}`)

  if (omittedCount > 0) {
    lines.unshift(`- ${omittedCount} earlier message(s) omitted for brevity.`)
  }

  return lines.join('\n')
}

export function compressConversationMessages(
  messages: ChatMessage[],
  options: CompressConversationOptions = {},
): CompressedConversation {
  const keepRecentMessages = normalizeRecentLimit(options.keepRecentMessages)
  if (messages.length <= keepRecentMessages) {
    return {
      recentMessages: messages.slice(),
      compressed: false,
    }
  }

  const recentMessages = messages.slice(-keepRecentMessages)
  const historicalMessages = messages.slice(0, -keepRecentMessages)

  const summary = buildSummary(historicalMessages, options)

  return {
    recentMessages,
    ...(summary ? { summary } : {}),
    compressed: true,
  }
}
