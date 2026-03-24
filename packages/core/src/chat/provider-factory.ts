import type { ChatProviderConfig } from '@openmnemo/types'

import { LLMProviderError } from './llm-provider.js'
import type { LLMProvider } from './llm-provider.js'
import {
  AnthropicChatProvider,
  DEFAULT_ANTHROPIC_CHAT_MODEL,
} from './providers/anthropic.js'
import {
  DEFAULT_OPENAI_COMPATIBLE_CHAT_MODEL,
  OpenAICompatibleChatProvider,
} from './providers/openai-compatible.js'

export function createChatProviderFromConfig(
  config: ChatProviderConfig | undefined,
): LLMProvider | undefined {
  if (!config) return undefined

  switch (config.kind) {
    case 'anthropic':
      return new AnthropicChatProvider({
        defaultModel: config.model ?? DEFAULT_ANTHROPIC_CHAT_MODEL,
        ...(config.api_key ? { apiKey: config.api_key } : {}),
      })
    case 'openai_compatible':
      return new OpenAICompatibleChatProvider({
        defaultModel: config.model ?? DEFAULT_OPENAI_COMPATIBLE_CHAT_MODEL,
        ...(config.api_key ? { apiKey: config.api_key } : {}),
        ...(config.base_url ? { baseUrl: config.base_url } : {}),
      })
  }

  throw new LLMProviderError(
    `Unsupported chat provider kind: ${String((config as { kind?: unknown }).kind)}`,
    'invalid_provider',
  )
}
