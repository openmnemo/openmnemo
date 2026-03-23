import type { RetrievalRefKind, RetrievalSource } from './memory.js'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatScope {
  project?: string
  partition?: string
  session_id?: string
}

export interface ChatRequestOptions {
  stream?: boolean
  max_context_hits?: number
  max_tokens?: number
  model?: string
}

export interface ChatRequest {
  session_id?: string
  messages: ChatMessage[]
  scope?: ChatScope
  options?: ChatRequestOptions
}

export interface ChatCitation {
  kind: RetrievalRefKind
  id: string
  title: string
  snippet?: string
  score?: number
  source?: RetrievalSource
  href?: string
  project?: string
  session_id?: string
  session_client?: string
  session_title?: string
  session_artifact_stem?: string
  started_at?: string
}

export interface ChatResponseMeta {
  model: string
  scope: ChatScope
  retrieval_count: number
  session_id?: string
}

export interface ChatMetaEvent {
  type: 'meta'
  meta: ChatResponseMeta
}

export interface ChatRetrievalEvent {
  type: 'retrieval'
  count: number
}

export interface ChatDeltaEvent {
  type: 'delta'
  text: string
}

export interface ChatCitationEvent {
  type: 'citation'
  citation: ChatCitation
}

export interface ChatDoneEvent {
  type: 'done'
  finish_reason: string
  text: string
}

export interface ChatErrorEvent {
  type: 'error'
  message: string
  code?: string
}

export type ChatEvent =
  | ChatMetaEvent
  | ChatRetrievalEvent
  | ChatDeltaEvent
  | ChatCitationEvent
  | ChatDoneEvent
  | ChatErrorEvent
