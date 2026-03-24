import type {
  ChatEvent,
  ChatRequest,
  ChatScope,
} from '@openmnemo/types'

import type { DataLayerAPI } from '../memory/data-layer-api.js'
import { buildChatContext } from './context-builder.js'
import type { LLMProvider } from './llm-provider.js'
import { LLMProviderError } from './llm-provider.js'
import { buildChatPrompt } from './prompt.js'

export interface ChatService {
  stream(request: ChatRequest): AsyncIterable<ChatEvent>
}

export interface ChatServiceOptions {
  dataLayer: DataLayerAPI
  provider: LLMProvider
  resolveProvider?: (request: ChatRequest) => LLMProvider | undefined
  defaultScope?: ChatScope
  defaultMaxContextHits?: number
}

const DEFAULT_MAX_CONTEXT_HITS = 8
const MAX_CONTEXT_HITS_CAP = 20

function mergeScope(
  base: ChatScope | undefined,
  override: ChatScope | undefined,
): ChatScope {
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  }
}

function hasScope(scope: ChatScope): boolean {
  return Boolean(scope.project || scope.partition || scope.session_id)
}

function normalizeContextHitLimit(input?: number, fallback = DEFAULT_MAX_CONTEXT_HITS): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return fallback
  return Math.max(1, Math.min(Math.floor(input), MAX_CONTEXT_HITS_CAP))
}

function normalizeMessageContent(text: string): string {
  return text.trim()
}

function toErrorEvent(error: unknown): ChatEvent {
  if (error instanceof LLMProviderError) {
    return {
      type: 'error',
      message: error.message,
      code: error.code,
    }
  }

  if (error instanceof Error) {
    return {
      type: 'error',
      message: error.message,
    }
  }

  return {
    type: 'error',
    message: 'Unknown chat error.',
  }
}

export function createChatService(options: ChatServiceOptions): ChatService {
  const defaultScope = options.defaultScope
  const defaultMaxContextHits = options.defaultMaxContextHits ?? DEFAULT_MAX_CONTEXT_HITS

  return {
    async *stream(request: ChatRequest): AsyncIterable<ChatEvent> {
      let provider: LLMProvider
      try {
        provider = options.resolveProvider?.(request) ?? options.provider
      } catch (error: unknown) {
        yield toErrorEvent(error)
        return
      }

      const messages = request.messages.map((message) => ({
        ...message,
        content: normalizeMessageContent(message.content),
      }))
      const lastMessage = messages[messages.length - 1]

      if (!lastMessage || lastMessage.role !== 'user' || !lastMessage.content) {
        yield {
          type: 'error',
          message: 'Chat request must end with a non-empty user message.',
          code: 'invalid_request',
        }
        return
      }

      const providerStatus = provider.getStatus()
      if (!providerStatus.available) {
        yield {
          type: 'error',
          message: providerStatus.message ?? 'Chat provider is unavailable.',
          ...(providerStatus.reason ? { code: providerStatus.reason } : {}),
        }
        return
      }

      const scope = mergeScope(defaultScope, request.scope)
      const maxContextHits = normalizeContextHitLimit(
        request.options?.max_context_hits,
        defaultMaxContextHits,
      )
      const sessionId = request.session_id?.trim()
      const retrieval = await options.dataLayer.search({
        text: lastMessage.content,
        target: 'mixed',
        limit: maxContextHits,
        ...(hasScope(scope) ? { scope } : {}),
      })
      const contextBundle = buildChatContext(retrieval.hits, maxContextHits)
      const model = request.options?.model?.trim()
        || request.provider?.model?.trim()
        || provider.defaultModel

      yield {
        type: 'meta',
        meta: {
          model,
          scope,
          retrieval_count: contextBundle.citations.length,
          ...(sessionId ? { session_id: sessionId } : {}),
        },
      }
      yield {
        type: 'retrieval',
        count: contextBundle.citations.length,
      }

      const prompt = buildChatPrompt({
        messages,
        context: contextBundle.context,
      })

      let text = ''
      let finishReason = 'stop'

      try {
        for await (const event of provider.stream({
          system: prompt.system,
          messages: prompt.messages,
          model,
          ...(typeof request.options?.max_tokens === 'number'
            ? { maxTokens: request.options.max_tokens }
            : {}),
        })) {
          if (event.type === 'delta') {
            text += event.text
            yield {
              type: 'delta',
              text: event.text,
            }
            continue
          }

          finishReason = event.reason
        }
      } catch (error: unknown) {
        yield toErrorEvent(error)
        return
      }

      for (const citation of contextBundle.citations) {
        yield {
          type: 'citation',
          citation,
        }
      }

      yield {
        type: 'done',
        finish_reason: finishReason,
        text,
      }
    },
  }
}
