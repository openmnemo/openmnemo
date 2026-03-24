import { describe, expect, it } from 'vitest'

import { compressConversationMessages } from '../../src/chat/conversation.js'
import { buildChatPrompt } from '../../src/chat/prompt.js'

describe('compressConversationMessages', () => {
  it('keeps short conversations unchanged', () => {
    const result = compressConversationMessages([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ])

    expect(result).toEqual({
      recentMessages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
      compressed: false,
    })
  })

  it('compresses older messages into a deterministic summary', () => {
    const result = compressConversationMessages([
      { role: 'user', content: 'Turn 1 user message with extra detail.' },
      { role: 'assistant', content: 'Turn 1 assistant answer.' },
      { role: 'user', content: 'Turn 2 user message.' },
      { role: 'assistant', content: 'Turn 2 assistant answer.' },
      { role: 'user', content: 'Turn 3 user message.' },
      { role: 'assistant', content: 'Turn 3 assistant answer.' },
      { role: 'user', content: 'Turn 4 user message.' },
      { role: 'assistant', content: 'Turn 4 assistant answer.' },
    ], {
      keepRecentMessages: 4,
      maxSummaryItems: 3,
      summarySnippetLimit: 40,
    })

    expect(result.compressed).toBe(true)
    expect(result.recentMessages).toHaveLength(4)
    expect(result.summary).toContain('earlier message(s) omitted for brevity')
    expect(result.summary).toContain('- assistant:')
  })
})

describe('buildChatPrompt', () => {
  it('injects compressed history summary into the final user message', () => {
    const prompt = buildChatPrompt({
      messages: [
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: 'Answer 1' },
        { role: 'user', content: 'Question 2' },
        { role: 'assistant', content: 'Answer 2' },
        { role: 'user', content: 'Question 3' },
        { role: 'assistant', content: 'Answer 3' },
        { role: 'user', content: 'What is the latest conclusion?' },
      ],
      context: 'Retrieved context block',
    })

    const finalMessage = prompt.messages[prompt.messages.length - 1]
    expect(finalMessage?.role).toBe('user')
    expect(finalMessage?.content).toContain('Earlier conversation summary:')
    expect(finalMessage?.content).toContain('Retrieved context:')
    expect(finalMessage?.content).toContain('User question:')
    expect(finalMessage?.content).toContain('What is the latest conclusion?')
  })
})
