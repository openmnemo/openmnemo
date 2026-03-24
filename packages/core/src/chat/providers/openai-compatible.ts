import type {
  LLMProvider,
  LLMProviderEvent,
  LLMProviderInput,
  LLMProviderStatus,
} from '../llm-provider.js'
import { LLMProviderError } from '../llm-provider.js'

export interface OpenAICompatibleChatProviderOptions {
  apiKey?: string
  baseUrl?: string
  defaultModel?: string
}

export const DEFAULT_OPENAI_COMPATIBLE_CHAT_MODEL = 'gpt-4o-mini'
const DEFAULT_MAX_TOKENS = 1024

interface OpenAICompatibleErrorPayload {
  error?: {
    message?: string
    code?: string
  }
}

interface OpenAICompatibleDeltaChoice {
  delta?: {
    content?: string | Array<{ text?: string }>
  }
  message?: {
    content?: string | Array<{ text?: string }>
  }
  finish_reason?: string | null
}

interface OpenAICompatibleChunk extends OpenAICompatibleErrorPayload {
  choices?: OpenAICompatibleDeltaChoice[]
}

function normalizeMaxTokens(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_TOKENS
  }
  return Math.floor(value)
}

function normalizeBaseUrl(value?: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/\/+$/, '')
}

function buildEndpoint(baseUrl: string): string {
  if (/\/chat\/completions$/i.test(baseUrl)) return baseUrl
  return `${baseUrl}/chat/completions`
}

function readContentText(
  content: string | Array<{ text?: string }> | undefined,
): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
}

function getDeltaText(payload: OpenAICompatibleChunk): string {
  const choice = payload.choices?.[0]
  if (!choice) return ''
  return readContentText(choice.delta?.content) || readContentText(choice.message?.content)
}

function getFinishReason(payload: OpenAICompatibleChunk): string | undefined {
  const finishReason = payload.choices?.[0]?.finish_reason
  return typeof finishReason === 'string' && finishReason.trim()
    ? finishReason
    : undefined
}

async function readErrorPayload(response: Response): Promise<OpenAICompatibleErrorPayload | null> {
  try {
    return (await response.json()) as OpenAICompatibleErrorPayload
  } catch {
    return null
  }
}

async function readJsonChunkPayload(response: Response): Promise<OpenAICompatibleChunk | null> {
  try {
    return (await response.json()) as OpenAICompatibleChunk
  } catch {
    return null
  }
}

function parseSseBuffer(
  buffer: string,
  onData: (data: string) => void,
): string {
  let separatorIndex = buffer.indexOf('\n\n')
  while (separatorIndex !== -1) {
    const rawEvent = buffer.slice(0, separatorIndex)
    buffer = buffer.slice(separatorIndex + 2)
    separatorIndex = buffer.indexOf('\n\n')

    if (!rawEvent.trim()) continue

    const dataLines: string[] = []
    rawEvent.split(/\r?\n/).forEach((line) => {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    })

    if (dataLines.length > 0) {
      onData(dataLines.join('\n'))
    }
  }

  return buffer
}

export class OpenAICompatibleChatProvider implements LLMProvider {
  readonly name = 'openai_compatible'
  readonly defaultModel: string
  private readonly apiKey: string | undefined
  private readonly baseUrl: string | undefined

  constructor(options: OpenAICompatibleChatProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.defaultModel = options.defaultModel ?? DEFAULT_OPENAI_COMPATIBLE_CHAT_MODEL
  }

  getStatus(): LLMProviderStatus {
    if (!this.baseUrl) {
      return {
        available: false,
        reason: 'missing_base_url',
        message: 'Base URL is required for the OpenAI-compatible relay.',
      }
    }

    if (!this.apiKey) {
      return {
        available: false,
        reason: 'missing_api_key',
        message: 'API key is required for the OpenAI-compatible relay.',
      }
    }

    return { available: true }
  }

  async *stream(input: LLMProviderInput): AsyncIterable<LLMProviderEvent> {
    const status = this.getStatus()
    if (!status.available) {
      throw new LLMProviderError(
        status.message ?? 'OpenAI-compatible relay is unavailable.',
        status.reason ?? 'provider_unavailable',
      )
    }

    const response = await fetch(buildEndpoint(this.baseUrl!), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model ?? this.defaultModel,
        stream: true,
        max_tokens: normalizeMaxTokens(input.maxTokens),
        messages: [
          { role: 'system', content: input.system },
          ...input.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
    })

    if (!response.ok) {
      const payload = await readErrorPayload(response)
      const message = payload?.error?.message
        ?? `OpenAI-compatible relay returned HTTP ${response.status}.`
      const code = payload?.error?.code || `http_${response.status}`
      throw new LLMProviderError(message, code)
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() || ''
    if (contentType.includes('application/json')) {
      const payload = await readJsonChunkPayload(response)
      if (!payload) {
        throw new LLMProviderError(
          'OpenAI-compatible relay returned invalid JSON.',
          'invalid_json',
        )
      }

      if (payload.error?.message) {
        throw new LLMProviderError(
          payload.error.message,
          payload.error.code ?? 'provider_error',
        )
      }

      const text = getDeltaText(payload)
      if (text) {
        yield { type: 'delta', text }
      }
      yield { type: 'done', reason: getFinishReason(payload) ?? 'stop' }
      return
    }

    if (!response.body) {
      throw new LLMProviderError(
        'OpenAI-compatible relay did not return a streaming body.',
        'missing_stream',
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finishReason = 'stop'
    let doneEmitted = false

    const flushData = function* (data: string): Generator<LLMProviderEvent> {
      if (data === '[DONE]') {
        doneEmitted = true
        yield { type: 'done', reason: finishReason }
        return
      }

      let payload: OpenAICompatibleChunk
      try {
        payload = JSON.parse(data) as OpenAICompatibleChunk
      } catch {
        return
      }

      if (payload.error?.message) {
        throw new LLMProviderError(
          payload.error.message,
          payload.error.code ?? 'provider_error',
        )
      }

      const text = getDeltaText(payload)
      if (text) {
        yield { type: 'delta', text }
      }

      const nextFinishReason = getFinishReason(payload)
      if (nextFinishReason) {
        finishReason = nextFinishReason
      }
    }

    while (!doneEmitted) {
      const result = await reader.read()
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true }).replace(/\r\n/g, '\n')
      const chunkEvents: LLMProviderEvent[] = []
      buffer = parseSseBuffer(buffer, (data) => {
        for (const event of flushData(data)) chunkEvents.push(event)
      })
      while (chunkEvents.length > 0) {
        const event = chunkEvents.shift()
        if (event) yield event
      }
    }

    buffer += decoder.decode().replace(/\r\n/g, '\n')
    const pendingEvents: LLMProviderEvent[] = []
    buffer = parseSseBuffer(buffer, (data) => {
      for (const event of flushData(data)) pendingEvents.push(event)
    })

    while (pendingEvents.length > 0) {
      const event = pendingEvents.shift()
      if (event) {
        if (event.type === 'done') doneEmitted = true
        yield event
      }
    }

    if (!doneEmitted) {
      yield { type: 'done', reason: finishReason }
    }
  }
}
