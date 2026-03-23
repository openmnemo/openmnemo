import { describe, expect, it, vi } from 'vitest'

import type { DataLayerAPI } from '../../src/memory/data-layer-api.js'
import { createChatService } from '../../src/chat/chat-service.js'
import type { LLMProvider } from '../../src/chat/llm-provider.js'

function createDataLayer(searchImpl: DataLayerAPI['search']): DataLayerAPI {
  return {
    search: searchImpl,
    getSession: async () => null,
    listSessions: async () => ({ items: [] }),
    getCommitContext: async () => null,
    getEntityGraph: async () => ({ nodes: [], edges: [] }),
  }
}

describe('createChatService', () => {
  it('streams retrieval-grounded events in order', async () => {
    const search = vi.fn(async () => ({
      query: {
        text: 'What changed last week?',
        target: 'mixed' as const,
        limit: 2,
        scope: { project: 'openmnemo' },
      },
      hits: [
        {
          ref: {
            kind: 'memory_unit' as const,
            id: 'memory_unit:1',
            project: 'openmnemo',
            score: 0.91,
            source: 'vector' as const,
          },
          memory_unit: {
            id: 'memory_unit:1',
            unit_type: 'decision' as const,
            title: 'Adopt unit-first retrieval',
            body: 'We agreed to search memory units before falling back to sessions.',
            project: 'openmnemo',
            source_kind: 'transcript' as const,
            source_id: 'source_asset:1',
            source_asset_ids: ['source_asset:1'],
            status: 'active' as const,
            created_at: '2026-03-20T10:00:00Z',
            updated_at: '2026-03-20T10:00:00Z',
          },
          session: {
            client: 'codex',
            project: 'openmnemo',
            session_id: 'session-1',
            title: 'Retrieval planning',
            cwd: '/repo/openmnemo',
            branch: 'main',
            started_at: '2026-03-20T10:00:00Z',
            clean_content: 'We agreed to search units first.',
            clean_path: '/memorytree/clean/codex/2026/03/session-1__deadbeef.md',
          },
        },
      ],
    }))

    const provider: LLMProvider = {
      name: 'fake',
      defaultModel: 'fake-model',
      getStatus: () => ({ available: true }),
      async *stream() {
        yield { type: 'delta', text: 'We moved to unit-first retrieval.' }
        yield { type: 'done', reason: 'stop' }
      },
    }

    const service = createChatService({
      dataLayer: createDataLayer(search),
      provider,
      defaultScope: { project: 'openmnemo' },
      defaultMaxContextHits: 2,
    })

    const events = []
    for await (const event of service.stream({
      session_id: 'chat-session-1',
      messages: [{ role: 'user', content: '  What changed last week?  ' }],
    })) {
      events.push(event)
    }

    expect(search).toHaveBeenCalledWith({
      text: 'What changed last week?',
      target: 'mixed',
      limit: 2,
      scope: { project: 'openmnemo' },
    })

    expect(events.map((event) => event.type)).toEqual([
      'meta',
      'retrieval',
      'delta',
      'citation',
      'done',
    ])

    expect(events[0]).toMatchObject({
      type: 'meta',
      meta: {
        model: 'fake-model',
        retrieval_count: 1,
        scope: { project: 'openmnemo' },
        session_id: 'chat-session-1',
      },
    })
    expect(events[3]).toMatchObject({
      type: 'citation',
      citation: {
        kind: 'memory_unit',
        id: 'memory_unit:1',
        title: 'Adopt unit-first retrieval',
        session_id: 'session-1',
        session_client: 'codex',
        session_artifact_stem: 'session-1__deadbeef',
      },
    })
    expect(events[4]).toMatchObject({
      type: 'done',
      finish_reason: 'stop',
      text: 'We moved to unit-first retrieval.',
    })
  })

  it('returns an error event when the provider is unavailable', async () => {
    const service = createChatService({
      dataLayer: createDataLayer(async () => ({ query: { text: '', target: 'mixed' }, hits: [] })),
      provider: {
        name: 'fake',
        defaultModel: 'fake-model',
        getStatus: () => ({ available: false, reason: 'missing_api_key' }),
        async *stream() {
          yield { type: 'done', reason: 'stop' }
        },
      },
    })

    const events = []
    for await (const event of service.stream({
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        type: 'error',
        message: 'ANTHROPIC_API_KEY is not set. Start the report server with a configured API key.',
        code: 'missing_api_key',
      },
    ])
  })
})
