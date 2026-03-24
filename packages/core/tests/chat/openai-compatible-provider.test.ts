import { afterEach, describe, expect, it, vi } from 'vitest'

import { LLMProviderError } from '../../src/chat/llm-provider.js'
import { OpenAICompatibleChatProvider } from '../../src/chat/providers/openai-compatible.js'

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunks[index]!))
      index += 1
    },
  })
}

async function collectEvents(provider: OpenAICompatibleChatProvider) {
  const events = []
  for await (const event of provider.stream({
    system: 'You answer from memory.',
    messages: [{ role: 'user', content: 'Hello relay' }],
    model: 'openai/gpt-4.1-mini',
  })) {
    events.push(event)
  }
  return events
}

describe('OpenAICompatibleChatProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('streams delta events from an OpenAI-compatible SSE endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(
      createStream([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatibleChatProvider({
      apiKey: 'relay-key',
      baseUrl: 'https://relay.example.com/v1',
      defaultModel: 'openai/gpt-4.1-mini',
    })
    const events = await collectEvents(provider)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://relay.example.com/v1/chat/completions')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'openai/gpt-4.1-mini',
      stream: true,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'You answer from memory.' },
        { role: 'user', content: 'Hello relay' },
      ],
    })
    expect(events).toEqual([
      { type: 'delta', text: 'Hello' },
      { type: 'delta', text: ' world' },
      { type: 'done', reason: 'stop' },
    ])
  })

  it('supports non-stream JSON relay responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'Hello from JSON relay',
            },
            finish_reason: 'stop',
          },
        ],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    )))

    const provider = new OpenAICompatibleChatProvider({
      apiKey: 'relay-key',
      baseUrl: 'https://relay.example.com/v1',
      defaultModel: 'openai/gpt-4.1-mini',
    })

    const events = await collectEvents(provider)

    expect(events).toEqual([
      { type: 'delta', text: 'Hello from JSON relay' },
      { type: 'done', reason: 'stop' },
    ])
  })

  it('surfaces relay HTTP errors as provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        error: {
          message: 'Invalid relay key.',
          code: 'invalid_api_key',
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    )))

    const provider = new OpenAICompatibleChatProvider({
      apiKey: 'bad-key',
      baseUrl: 'https://relay.example.com/v1',
    })

    await expect(collectEvents(provider)).rejects.toEqual(
      expect.objectContaining<Partial<LLMProviderError>>({
        message: 'Invalid relay key.',
        code: 'invalid_api_key',
      }),
    )
  })
})
