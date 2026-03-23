import type { ChatMessage } from '@openmnemo/types'

export interface LLMProviderInput {
  system: string
  messages: ChatMessage[]
  model?: string
  maxTokens?: number
}

export interface LLMProviderStatus {
  available: boolean
  reason?: string
}

export interface LLMProviderDeltaEvent {
  type: 'delta'
  text: string
}

export interface LLMProviderDoneEvent {
  type: 'done'
  reason: string
}

export type LLMProviderEvent =
  | LLMProviderDeltaEvent
  | LLMProviderDoneEvent

export interface LLMProvider {
  readonly name: string
  readonly defaultModel: string
  getStatus(): LLMProviderStatus
  stream(input: LLMProviderInput): AsyncIterable<LLMProviderEvent>
}

export class LLMProviderError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'LLMProviderError'
    this.code = code
  }
}
