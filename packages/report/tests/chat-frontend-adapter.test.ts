import { describe, expect, it } from 'vitest'

import { renderChatFrontendAdapterScript } from '../src/chat/frontend-adapter.js'

describe('renderChatFrontendAdapterScript', () => {
  it('keeps relay API keys in sessionStorage instead of localStorage', () => {
    const script = renderChatFrontendAdapterScript({
      healthUrl: '/api/chat/health',
      chatUrl: '/api/chat',
      storagePrefix: 'openmnemo-report-chat',
      basePath: '/',
    })

    expect(script).toContain("sessionStorage.getItem(getApiKeyStorageKey(projectKey))")
    expect(script).toContain("sessionStorage.setItem(getApiKeyStorageKey(state.projectKey), state.chatConfig.apiKey)")
    expect(script).toContain("sessionStorage.removeItem(getApiKeyStorageKey(state.projectKey))")
    expect(script).not.toContain('JSON.stringify(state.chatConfig)')
  })

  it('excludes failed assistant messages from future request context', () => {
    const script = renderChatFrontendAdapterScript({
      healthUrl: '/api/chat/health',
      chatUrl: '/api/chat',
      storagePrefix: 'openmnemo-report-chat',
      basePath: '/',
    })

    expect(script).toContain("if (entry.failed === true) return false;")
    expect(script).toContain("assistantEntry.failed = true;")
    expect(script).toContain("assistantEntry.content = assistantText || 'Request failed. See error below.';")
  })
})
