import type {
  ArchiveAnchor,
  ManifestEntry,
  MemoryUnit,
  ParsedTranscript,
  SourceAsset,
  TranscriptMessage,
} from '@openmnemo/types'
import type {
  GraphAdapter,
  GraphEdge as AdapterGraphEdge,
  GraphNode as AdapterGraphNode,
} from '../storage/graph/graph-adapter.js'

import { contentHash, timestampPartition, truncate } from '../transcript/common.js'

export const TRANSCRIPT_MEMORY_EXTRACTION_VERSION = 'transcript-memory-bundle.v1'
export const TRANSCRIPT_MEMORY_EXTRACTOR = 'deterministic-transcript-baseline'

export interface MemoryGraphNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

export interface MemoryGraphEdge {
  from_id: string
  to_id: string
  type: string
  properties?: Record<string, unknown>
}

export interface MemoryExtractionBundle {
  extraction_version: string
  extractor: string
  generated_at: string
  project: string
  session_id: string
  source_asset: SourceAsset
  memory_units: MemoryUnit[]
  archive_anchor: ArchiveAnchor
  graph: {
    nodes: MemoryGraphNode[]
    edges: MemoryGraphEdge[]
  }
}

function formatKindLabel(value: string): string {
  return value.replace(/_/g, ' ')
}

function managedGraphMetadata(rootId: string): Record<string, string> {
  return {
    managed_by: TRANSCRIPT_MEMORY_EXTRACTOR,
    managed_root_id: rootId,
    managed_scope: 'session',
  }
}

function withManagedGraphProperties(
  rootId: string,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...properties,
    ...managedGraphMetadata(rootId),
  }
}

interface TranscriptUnitSegment {
  title: string
  summary: string
  body: string
  sourceRef: string
}

function sessionNodeId(manifest: ManifestEntry): string {
  return `session:${manifest.client}:${manifest.project}:${manifest.session_id}`
}

function sourceAssetId(manifest: ManifestEntry): string {
  return `source_asset:${manifest.client}:${manifest.project}:${manifest.session_id}:${manifest.raw_sha256.slice(0, 8)}`
}

function archiveAnchorId(manifest: ManifestEntry): string {
  return `archive_anchor:${manifest.client}:${manifest.project}:${manifest.session_id}:${manifest.raw_sha256.slice(0, 8)}`
}

function sourcePartition(timestamp: string): string | undefined {
  const [yearToken, monthToken] = timestampPartition(timestamp)
  if (yearToken === 'unknown' || monthToken === 'unknown') return undefined
  return `${yearToken}-${monthToken}`
}

function formatRoleLabel(role: string): string {
  const normalized = role.trim().toLowerCase()
  switch (normalized) {
    case 'user':
      return 'User'
    case 'assistant':
      return 'Assistant'
    default:
      return normalized ? normalized[0]!.toUpperCase() + normalized.slice(1) : 'Message'
  }
}

function segmentMessages(messages: readonly TranscriptMessage[]): TranscriptMessage[][] {
  const segments: TranscriptMessage[][] = []
  let current: TranscriptMessage[] = []

  for (const message of messages) {
    if (message.role === 'user' && current.length > 0) {
      segments.push(current)
      current = []
    }
    current.push(message)
  }

  if (current.length > 0) {
    segments.push(current)
  }

  return segments
}

function createTurnSegments(parsed: ParsedTranscript, manifest: ManifestEntry): TranscriptUnitSegment[] {
  const baseTitle = manifest.title || manifest.session_id
  const segments: TranscriptUnitSegment[] = segmentMessages(parsed.messages).map((messages, index) => {
    const firstText = messages.find((message) => message.text.trim())?.text ?? baseTitle
    const summary = truncate(firstText.split(/\r?\n/, 1)[0]!.trim() || baseTitle, 160)
    const body = messages.map((message) => [
      `${formatRoleLabel(message.role)}:`,
      message.text.trim(),
    ].join('\n')).join('\n\n')

    return {
      title: `${baseTitle} Turn ${index + 1}`,
      summary,
      body,
      sourceRef: `turn:${index + 1}`,
    }
  })

  if (parsed.tool_events.length > 0) {
    const summary = truncate(parsed.tool_events[0]!.summary, 160)
    segments.push({
      title: `${baseTitle} Tools`,
      summary,
      body: parsed.tool_events
        .map((event, index) => `${index + 1}. ${event.summary}`)
        .join('\n'),
      sourceRef: 'tools',
    })
  }

  if (segments.length === 0) {
    segments.push({
      title: baseTitle,
      summary: truncate(baseTitle, 160),
      body: baseTitle,
      sourceRef: 'session',
    })
  }

  return segments
}

export function buildTranscriptSourceAsset(
  manifest: ManifestEntry,
  cleanContent: string,
): SourceAsset {
  const partition = sourcePartition(manifest.started_at)
  return {
    id: sourceAssetId(manifest),
    asset_kind: 'transcript',
    project: manifest.project,
    ...(partition ? { partition } : {}),
    title: manifest.title || manifest.session_id,
    mime_type: 'text/markdown',
    text_content: cleanContent,
    source_uri: manifest.global_clean_path,
    import_ref: manifest.global_manifest_path,
    created_at: manifest.imported_at,
    updated_at: manifest.imported_at,
  }
}

export function buildTranscriptExtractionBundle(
  parsed: ParsedTranscript,
  manifest: ManifestEntry,
  cleanContent: string,
): MemoryExtractionBundle {
  const sourceAsset = buildTranscriptSourceAsset(manifest, cleanContent)
  const rawSegments = createTurnSegments(parsed, manifest)
  const partition = sourceAsset.partition
  const sessionRootId = sessionNodeId(manifest)

  const memoryUnits = rawSegments.map((segment, index): MemoryUnit => ({
    id: `memory_unit:${manifest.client}:${manifest.project}:${manifest.session_id}:${String(index + 1).padStart(3, '0')}:${contentHash(segment.body)}`,
    unit_type: 'document_chunk',
    title: segment.title,
    body: segment.body,
    summary: segment.summary,
    project: manifest.project,
    ...(partition ? { partition } : {}),
    source_kind: 'transcript',
    source_id: sourceAsset.id,
    source_ref: segment.sourceRef,
    source_asset_ids: [sourceAsset.id],
    confidence: 1,
    weight: 1,
    status: 'active',
    created_at: manifest.imported_at,
    updated_at: manifest.imported_at,
  }))

  memoryUnits.forEach((unit, index) => {
    const related: string[] = []
    if (index > 0) related.push(memoryUnits[index - 1]!.id)
    if (index < memoryUnits.length - 1) related.push(memoryUnits[index + 1]!.id)
    if (related.length > 0) {
      unit.related_unit_ids = related
    }
  })

  const archiveAnchor: ArchiveAnchor = {
    id: archiveAnchorId(manifest),
    scope: 'session',
    title: manifest.title || manifest.session_id,
    summary: truncate(
      rawSegments
        .map((segment, index) => `T${index + 1}: ${segment.summary}`)
        .join(' | '),
      320,
    ),
    project: manifest.project,
    ...(partition ? { partition } : {}),
    source_asset_ids: [sourceAsset.id],
    memory_unit_ids: memoryUnits.map((unit) => unit.id),
    created_at: manifest.imported_at,
    updated_at: manifest.imported_at,
  }

  const sessionNode: MemoryGraphNode = {
    id: sessionRootId,
    labels: ['Session'],
    properties: withManagedGraphProperties(sessionRootId, {
      entity_kind: 'session',
      client: manifest.client,
      project: manifest.project,
      session_id: manifest.session_id,
      title: manifest.title,
      started_at: manifest.started_at,
      cwd: manifest.cwd,
      branch: manifest.branch,
    }),
  }

  const graphNodes: MemoryGraphNode[] = [
    sessionNode,
    {
      id: sourceAsset.id,
      labels: ['SourceAsset', 'Transcript'],
      properties: withManagedGraphProperties(sessionRootId, {
        entity_kind: 'source asset',
        asset_kind: formatKindLabel(sourceAsset.asset_kind),
        project: sourceAsset.project,
        title: sourceAsset.title,
        source_uri: sourceAsset.source_uri,
        import_ref: sourceAsset.import_ref,
      }),
    },
    {
      id: archiveAnchor.id,
      labels: ['ArchiveAnchor'],
      properties: withManagedGraphProperties(sessionRootId, {
        entity_kind: 'archive anchor',
        scope: archiveAnchor.scope,
        title: archiveAnchor.title,
        summary: archiveAnchor.summary,
      }),
    },
    ...memoryUnits.map((unit) => ({
      id: unit.id,
      labels: ['MemoryUnit', 'DocumentChunk'],
      properties: withManagedGraphProperties(sessionRootId, {
        entity_kind: 'memory unit',
        unit_type: unit.unit_type,
        unit_type_display: formatKindLabel(unit.unit_type),
        project: unit.project,
        title: unit.title,
        summary: unit.summary,
        source_ref: unit.source_ref,
      }),
    })),
  ]

  const graphEdges: MemoryGraphEdge[] = [
    {
      from_id: sessionNode.id,
      to_id: sourceAsset.id,
      type: 'HAS_SOURCE_ASSET',
      properties: withManagedGraphProperties(sessionRootId, {}),
    },
    {
      from_id: sessionNode.id,
      to_id: archiveAnchor.id,
      type: 'HAS_ARCHIVE_ANCHOR',
      properties: withManagedGraphProperties(sessionRootId, {}),
    },
    ...memoryUnits.flatMap((unit, index) => {
      const edges: MemoryGraphEdge[] = [
        {
          from_id: sessionNode.id,
          to_id: unit.id,
          type: 'CONTAINS_UNIT',
          properties: withManagedGraphProperties(sessionRootId, { position: index + 1 }),
        },
        {
          from_id: sourceAsset.id,
          to_id: unit.id,
          type: 'EMITS_UNIT',
          properties: withManagedGraphProperties(sessionRootId, { source_ref: unit.source_ref ?? '' }),
        },
        {
          from_id: archiveAnchor.id,
          to_id: unit.id,
          type: 'SUMMARIZES',
          properties: withManagedGraphProperties(sessionRootId, { position: index + 1 }),
        },
      ]
      if (index < memoryUnits.length - 1) {
        edges.push({
          from_id: unit.id,
          to_id: memoryUnits[index + 1]!.id,
          type: 'NEXT_UNIT',
          properties: withManagedGraphProperties(sessionRootId, {}),
        })
      }
      return edges
    }),
  ]

  return {
    extraction_version: TRANSCRIPT_MEMORY_EXTRACTION_VERSION,
    extractor: TRANSCRIPT_MEMORY_EXTRACTOR,
    generated_at: manifest.imported_at,
    project: manifest.project,
    session_id: manifest.session_id,
    source_asset: sourceAsset,
    memory_units: memoryUnits,
    archive_anchor: archiveAnchor,
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
  }
}

function toAdapterGraphNode(node: MemoryGraphNode): AdapterGraphNode {
  return {
    id: node.id,
    labels: node.labels,
    properties: node.properties,
  }
}

function toAdapterGraphEdge(edge: MemoryGraphEdge): AdapterGraphEdge {
  return {
    fromId: edge.from_id,
    toId: edge.to_id,
    type: edge.type,
    ...(edge.properties ? { properties: edge.properties } : {}),
  }
}

function resolveExtractionRootId(bundle: MemoryExtractionBundle): string {
  const sessionNode = bundle.graph.nodes.find((node) =>
    node.labels.includes('Session')
      && node.properties['session_id'] === bundle.session_id)

  if (!sessionNode) {
    throw new Error('MemoryExtractionBundle is missing its Session root node')
  }

  return sessionNode.id
}

export function syncExtractionBundleGraph(
  graph: GraphAdapter,
  bundle: MemoryExtractionBundle,
): void {
  graph.deleteManagedSubgraph({
    managedBy: bundle.extractor,
    managedRootId: resolveExtractionRootId(bundle),
  })

  for (const node of bundle.graph.nodes) {
    graph.upsertNode(toAdapterGraphNode(node))
  }

  for (const edge of bundle.graph.edges) {
    graph.upsertEdge(toAdapterGraphEdge(edge))
  }
}
