import type { LLMProvider, LLMProviderEvent, LLMProviderInput, LLMProviderStatus } from '../llm-provider.js'
import { LLMProviderError } from '../llm-provider.js'

export interface AnthropicChatProviderOptions {
  apiKey?: string
  defaultModel?: string
}

export const DEFAULT_ANTHROPIC_CHAT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 1024

interface AnthropicFinalMessage {
  stop_reason?: string | null
}

function normalizeMaxTokens(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_TOKENS
  }
  return Math.floor(value)
}

function getStopReason(message: AnthropicFinalMessage): string {
  return message.stop_reason ?? 'stop'
}

export class AnthropicChatProvider implements LLMProvider {
  readonly name = 'anthropic'
  readonly defaultModel: string
  private readonly apiKey: string | undefined

  constructor(options: AnthropicChatProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY']
    this.defaultModel = options.defaultModel ?? DEFAULT_ANTHROPIC_CHAT_MODEL
  }

  getStatus(): LLMProviderStatus {
    return this.apiKey
      ? { available: true }
      : { available: false, reason: 'missing_api_key' }
  }

  async *stream(input: LLMProviderInput): AsyncIterable<LLMProviderEvent> {
    if (!this.apiKey) {
      throw new LLMProviderError(
        'ANTHROPIC_API_KEY is not set. Start the report server with a configured API key.',
        'missing_api_key',
      )
    }

    const { default: Anthropic } = await (import('@anthropic-ai/sdk') as Promise<{ default: typeof import('@anthropic-ai/sdk').default }>)
    const client = new Anthropic({ apiKey: this.apiKey })
    const stream = client.messages.stream({
      model: input.model ?? this.defaultModel,
      max_tokens: normalizeMaxTokens(input.maxTokens),
      system: input.system,
      messages: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    })

    const queue: LLMProviderEvent[] = []
    let finished = false
    let failure: unknown = null
    const waiters: Array<() => void> = []

    const wake = (): void => {
      const waiter = waiters.shift()
      if (waiter) waiter()
    }

    stream.on('text', (textDelta: string) => {
      queue.push({ type: 'delta', text: textDelta })
      wake()
    })
    stream.on('finalMessage', (message: AnthropicFinalMessage) => {
      queue.push({ type: 'done', reason: getStopReason(message) })
      finished = true
      wake()
    })
    stream.on('error', (error: unknown) => {
      failure = error
      finished = true
      wake()
    })
    stream.on('abort', (error: unknown) => {
      failure = error
      finished = true
      wake()
    })
    stream.on('end', () => {
      finished = true
      wake()
    })

    while (!finished || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve)
        })
      }

      while (queue.length > 0) {
        yield queue.shift()!
      }

      if (failure) throw failure
    }

    if (failure) throw failure
  }
}
