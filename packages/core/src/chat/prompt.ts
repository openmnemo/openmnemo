import type { ChatMessage } from '@openmnemo/types'

export interface ChatPromptInput {
  messages: ChatMessage[]
  context: string
}

export interface ChatPrompt {
  system: string
  messages: ChatMessage[]
}

export function buildChatPrompt(input: ChatPromptInput): ChatPrompt {
  const messages = input.messages.slice()
  const lastMessage = messages[messages.length - 1]

  if (!lastMessage || lastMessage.role !== 'user') {
    return {
      system: buildChatSystemPrompt(),
      messages,
    }
  }

  const history = messages.slice(0, -1)
  const contextBlock = input.context
    ? input.context
    : 'No matching memory context was found. Say so clearly and avoid guessing.'

  return {
    system: buildChatSystemPrompt(),
    messages: [
      ...history,
      {
        role: 'user',
        content: [
          'You are answering a question about the local OpenMnemo memory store.',
          '',
          'Retrieved context:',
          contextBlock,
          '',
          'User question:',
          lastMessage.content,
        ].join('\n'),
      },
    ],
  }
}

export function buildChatSystemPrompt(): string {
  return [
    'You are OpenMnemo Chat, a memory-grounded assistant for a local project archive.',
    'Answer from the retrieved context first.',
    'If the context is incomplete or uncertain, say so plainly.',
    'Do not invent project history, commits, or decisions that are not supported by the provided context.',
    'Prefer concrete references to sessions, memory units, or anchors when they are present.',
    'Keep answers concise but useful.',
  ].join(' ')
}
