import type {
  ChatCitation,
  DataLayerSearchHit,
  SessionDetail,
  SessionRecord,
} from '@openmnemo/types'

import { basename } from 'node:path'
import { truncate } from '../transcript/common.js'

export interface ChatContextBundle {
  context: string
  citations: ChatCitation[]
}

const DEFAULT_CONTEXT_SNIPPET_LIMIT = 280

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function summarizeSnippet(value: string, limit = DEFAULT_CONTEXT_SNIPPET_LIMIT): string | undefined {
  const normalized = normalizeWhitespace(value)
  return normalized ? truncate(normalized, limit) : undefined
}

function asSessionDetail(session?: SessionRecord): SessionDetail | undefined {
  return session as SessionDetail | undefined
}

function citationTitle(hit: DataLayerSearchHit): string {
  if (hit.memory_unit?.title) return hit.memory_unit.title
  if (hit.archive_anchor?.title) return hit.archive_anchor.title
  if (hit.source_asset?.title) return hit.source_asset.title
  if (hit.session?.title) return hit.session.title
  return hit.ref.id
}

function citationSnippet(hit: DataLayerSearchHit): string | undefined {
  if (hit.memory_unit) {
    return summarizeSnippet(hit.memory_unit.summary ?? hit.memory_unit.body)
  }
  if (hit.archive_anchor) {
    return summarizeSnippet(hit.archive_anchor.summary)
  }
  if (hit.source_asset) {
    return summarizeSnippet(hit.source_asset.text_content ?? '')
  }

  const session = asSessionDetail(hit.session)
  if (session?.clean_content) {
    return summarizeSnippet(session.clean_content)
  }

  return undefined
}

function toCitation(hit: DataLayerSearchHit): ChatCitation {
  const session = hit.session
  const sessionDetail = asSessionDetail(session)
  const citation: ChatCitation = {
    kind: hit.ref.kind,
    id: hit.ref.id,
    title: citationTitle(hit),
  }

  if (typeof hit.ref.score === 'number') citation.score = hit.ref.score
  if (hit.ref.source) citation.source = hit.ref.source
  if (hit.ref.project) citation.project = hit.ref.project

  const snippet = citationSnippet(hit)
  if (snippet) citation.snippet = snippet
  if (session?.session_id) citation.session_id = session.session_id
  if (session?.client) citation.session_client = session.client
  if (session?.title) citation.session_title = session.title
  if (session?.started_at) citation.started_at = session.started_at
  if (sessionDetail?.clean_path) {
    citation.session_artifact_stem = basename(sessionDetail.clean_path, '.md')
  }

  return citation
}

function describeHit(hit: DataLayerSearchHit): string {
  switch (hit.ref.kind) {
    case 'memory_unit': {
      const unit = hit.memory_unit
      if (!unit) return ''
      return [
        `type: memory_unit (${unit.unit_type})`,
        `title: ${unit.title}`,
        `body: ${summarizeSnippet(unit.body) ?? ''}`,
      ].join('\n')
    }
    case 'archive_anchor': {
      const anchor = hit.archive_anchor
      if (!anchor) return ''
      return [
        `type: archive_anchor (${anchor.scope})`,
        `title: ${anchor.title}`,
        `summary: ${summarizeSnippet(anchor.summary) ?? ''}`,
      ].join('\n')
    }
    case 'source_asset': {
      const asset = hit.source_asset
      if (!asset) return ''
      return [
        `type: source_asset (${asset.asset_kind})`,
        `title: ${asset.title ?? asset.id}`,
        `content: ${summarizeSnippet(asset.text_content ?? '') ?? ''}`,
      ].join('\n')
    }
    case 'session': {
      const session = asSessionDetail(hit.session)
      if (!session) return ''
      return [
        'type: session',
        `title: ${session.title}`,
        `started_at: ${session.started_at}`,
        `content: ${summarizeSnippet(session.clean_content ?? '') ?? ''}`,
      ].join('\n')
    }
    case 'commit':
      return `type: commit\nref: ${hit.ref.id}`
  }
}

function formatContextEntry(index: number, citation: ChatCitation, hit: DataLayerSearchHit): string {
  const header = [
    `[#${index}]`,
    `kind=${citation.kind}`,
    `id=${citation.id}`,
    `title=${citation.title}`,
  ]
  if (citation.session_id) header.push(`session_id=${citation.session_id}`)
  if (citation.project) header.push(`project=${citation.project}`)

  const detail = describeHit(hit)
  return detail
    ? `${header.join(' | ')}\n${detail}`
    : header.join(' | ')
}

export function buildChatContext(
  hits: DataLayerSearchHit[],
  limit: number,
): ChatContextBundle {
  const selected = hits.slice(0, Math.max(limit, 0))
  const citations = selected.map(toCitation)
  const blocks = selected.map((hit, index) => formatContextEntry(index + 1, citations[index]!, hit))

  return {
    context: blocks.join('\n\n'),
    citations,
  }
}
