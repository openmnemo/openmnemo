import type { ChatProviderKind, ChatScope } from '@openmnemo/types'

import { createLocalDataLayerAPI } from '../memory/local-runtime.js'
import { createChatService, type ChatService } from './chat-service.js'
import type { LLMProvider } from './llm-provider.js'
import { createChatProviderFromConfig } from './provider-factory.js'
import { AnthropicChatProvider, DEFAULT_ANTHROPIC_CHAT_MODEL } from './providers/anthropic.js'

export interface LocalChatServiceStatus {
  provider: string
  model: string
  available: boolean
  reason?: string
  scope: ChatScope
  request_provider_config_supported: boolean
  supported_providers: ChatProviderKind[]
}

export interface LocalChatService extends ChatService {
  getStatus(): LocalChatServiceStatus
}

export interface LocalChatServiceOptions {
  globalRoot: string
  defaultScope?: ChatScope
  defaultModel?: string
  provider?: LLMProvider
}

export function createLocalChatService(options: LocalChatServiceOptions): LocalChatService {
  const provider = options.provider ?? new AnthropicChatProvider({
    defaultModel: options.defaultModel ?? DEFAULT_ANTHROPIC_CHAT_MODEL,
  })
  const service = createChatService({
    dataLayer: createLocalDataLayerAPI({ globalRoot: options.globalRoot }),
    provider,
    resolveProvider(request) {
      return createChatProviderFromConfig(request.provider) ?? provider
    },
    ...(options.defaultScope ? { defaultScope: options.defaultScope } : {}),
  })

  return {
    stream(request) {
      return service.stream(request)
    },

    getStatus(): LocalChatServiceStatus {
      const status = provider.getStatus()
      return {
        provider: provider.name,
        model: provider.defaultModel,
        available: status.available,
        ...(status.reason ? { reason: status.reason } : {}),
        scope: options.defaultScope ?? {},
        request_provider_config_supported: true,
        supported_providers: ['anthropic', 'openai_compatible'],
      }
    },
  }
}
