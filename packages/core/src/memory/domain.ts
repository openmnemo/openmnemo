import type {
  ArchiveAnchor,
  ArchiveAnchorScope,
  CommitContext,
  DataLayerSearchHit,
  DataLayerSearchQuery,
  DataLayerSearchResponse,
  DataLayerSearchTarget,
  EntityGraphEdgeView,
  EntityGraphNodeView,
  EntityGraphView,
  MemoryUnit,
  MemoryUnitStatus,
  MemoryUnitType,
  RetrievalQuery,
  RetrievalRefKind,
  RetrievalReference,
  RetrievalScope,
  RetrievalSource,
  SessionDetail,
  SessionRecord,
  SourceAnchor,
  SourceAsset,
  SourceAssetKind,
} from '@openmnemo/types'
import type { MemoryExtractionBundle, MemoryGraphEdge, MemoryGraphNode } from './extraction.js'

export const MEMORY_UNIT_TYPES = [
  'fact',
  'decision',
  'constraint',
  'preference',
  'task',
  'insight',
  'summary',
  'document_chunk',
] as const satisfies readonly MemoryUnitType[]

export const MEMORY_UNIT_STATUSES = [
  'active',
  'superseded',
  'archived',
  'done',
  'hidden',
] as const satisfies readonly MemoryUnitStatus[]

export const SOURCE_ASSET_KINDS = [
  'transcript',
  'document',
  'web',
  'video',
  'audio',
  'image',
  'manual',
] as const satisfies readonly SourceAssetKind[]

export const ARCHIVE_ANCHOR_SCOPES = [
  'session',
  'document',
  'project',
  'manual',
] as const satisfies readonly ArchiveAnchorScope[]

export const RETRIEVAL_REF_KINDS = [
  'session',
  'memory_unit',
  'source_asset',
  'archive_anchor',
  'commit',
] as const satisfies readonly RetrievalRefKind[]

export const RETRIEVAL_SOURCES = [
  'fts',
  'vector',
  'graph',
  'commit',
  'mixed',
] as const satisfies readonly RetrievalSource[]

export const DATA_LAYER_SEARCH_TARGETS = [
  'session',
  'memory_unit',
  'source_asset',
  'archive_anchor',
  'mixed',
] as const satisfies readonly DataLayerSearchTarget[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord)
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T)
}

export function isMemoryUnitType(value: unknown): value is MemoryUnitType {
  return isOneOf(value, MEMORY_UNIT_TYPES)
}

export function isMemoryUnitStatus(value: unknown): value is MemoryUnitStatus {
  return isOneOf(value, MEMORY_UNIT_STATUSES)
}

export function isSourceAssetKind(value: unknown): value is SourceAssetKind {
  return isOneOf(value, SOURCE_ASSET_KINDS)
}

export function isArchiveAnchorScope(value: unknown): value is ArchiveAnchorScope {
  return isOneOf(value, ARCHIVE_ANCHOR_SCOPES)
}

export function isRetrievalRefKind(value: unknown): value is RetrievalRefKind {
  return isOneOf(value, RETRIEVAL_REF_KINDS)
}

export function isRetrievalSource(value: unknown): value is RetrievalSource {
  return isOneOf(value, RETRIEVAL_SOURCES)
}

export function isDataLayerSearchTarget(value: unknown): value is DataLayerSearchTarget {
  return isOneOf(value, DATA_LAYER_SEARCH_TARGETS)
}

export function isSourceAnchor(value: unknown): value is SourceAnchor {
  return isRecord(value)
    && hasNonEmptyString(value.asset_id)
    && isOptionalString(value.locator)
    && isOptionalString(value.session_id)
    && isOptionalString(value.commit_ref)
}

export function isRetrievalScope(value: unknown): value is RetrievalScope {
  if (!isRecord(value)) return false
  if (!isOptionalString(value.project)) return false
  if (!isOptionalString(value.partition)) return false
  if (!isOptionalString(value.session_id)) return false
  if (value.unit_types !== undefined) {
    if (!Array.isArray(value.unit_types)) return false
    if (!value.unit_types.every(isMemoryUnitType)) return false
  }
  return true
}

export function isRetrievalQuery(value: unknown): value is RetrievalQuery {
  return isRecord(value)
    && hasNonEmptyString(value.text)
    && (value.limit === undefined || (typeof value.limit === 'number' && Number.isFinite(value.limit) && value.limit >= 0))
    && (value.scope === undefined || isRetrievalScope(value.scope))
}

export function isRetrievalReference(value: unknown): value is RetrievalReference {
  return isRecord(value)
    && isRetrievalRefKind(value.kind)
    && hasNonEmptyString(value.id)
    && isOptionalNumber(value.score)
    && isOptionalString(value.project)
    && isOptionalString(value.partition)
    && (value.source === undefined || isRetrievalSource(value.source))
}

export function isSessionRecord(value: unknown): value is SessionRecord {
  return isRecord(value)
    && hasNonEmptyString(value.client)
    && hasNonEmptyString(value.project)
    && hasNonEmptyString(value.session_id)
    && hasNonEmptyString(value.title)
    && hasNonEmptyString(value.cwd)
    && hasNonEmptyString(value.branch)
    && hasNonEmptyString(value.started_at)
}

export function isSessionDetail(value: unknown): value is SessionDetail {
  if (!isRecord(value) || !isSessionRecord(value)) return false
  return isOptionalString(value.clean_content)
    && isOptionalString(value.clean_path)
    && isOptionalString(value.commit_layer)
    && isOptionalNumber(value.message_count)
    && isOptionalNumber(value.tool_event_count)
}

export function isMemoryUnit(value: unknown): value is MemoryUnit {
  return isRecord(value)
    && hasNonEmptyString(value.id)
    && isMemoryUnitType(value.unit_type)
    && hasNonEmptyString(value.title)
    && hasNonEmptyString(value.body)
    && isOptionalString(value.summary)
    && hasNonEmptyString(value.project)
    && isOptionalString(value.partition)
    && isSourceAssetKind(value.source_kind)
    && hasNonEmptyString(value.source_id)
    && isOptionalString(value.source_ref)
    && isStringArray(value.source_asset_ids)
    && (value.commit_refs === undefined || isStringArray(value.commit_refs))
    && (value.entity_refs === undefined || isStringArray(value.entity_refs))
    && (value.related_unit_ids === undefined || isStringArray(value.related_unit_ids))
    && (value.supersedes === undefined || isStringArray(value.supersedes))
    && isOptionalNumber(value.confidence)
    && isOptionalNumber(value.weight)
    && isMemoryUnitStatus(value.status)
    && hasNonEmptyString(value.created_at)
    && hasNonEmptyString(value.updated_at)
}

export function isSourceAsset(value: unknown): value is SourceAsset {
  return isRecord(value)
    && hasNonEmptyString(value.id)
    && isSourceAssetKind(value.asset_kind)
    && hasNonEmptyString(value.project)
    && isOptionalString(value.partition)
    && isOptionalString(value.title)
    && isOptionalString(value.mime_type)
    && isOptionalString(value.text_content)
    && isOptionalString(value.source_uri)
    && isOptionalString(value.import_ref)
    && isOptionalString(value.commit_ref)
    && hasNonEmptyString(value.created_at)
    && hasNonEmptyString(value.updated_at)
}

export function isArchiveAnchor(value: unknown): value is ArchiveAnchor {
  return isRecord(value)
    && hasNonEmptyString(value.id)
    && isArchiveAnchorScope(value.scope)
    && hasNonEmptyString(value.title)
    && hasNonEmptyString(value.summary)
    && hasNonEmptyString(value.project)
    && isOptionalString(value.partition)
    && isStringArray(value.source_asset_ids)
    && isStringArray(value.memory_unit_ids)
    && isOptionalString(value.commit_ref)
    && hasNonEmptyString(value.created_at)
    && hasNonEmptyString(value.updated_at)
}

export function isDataLayerSearchQuery(value: unknown): value is DataLayerSearchQuery {
  return isRetrievalQuery(value)
    && (!isRecord(value) || value.target === undefined || isDataLayerSearchTarget(value.target))
}

export function isMemoryGraphNode(value: unknown): value is MemoryGraphNode {
  return isRecord(value)
    && hasNonEmptyString(value.id)
    && isStringArray(value.labels)
    && isRecord(value.properties)
}

export function isMemoryGraphEdge(value: unknown): value is MemoryGraphEdge {
  return isRecord(value)
    && hasNonEmptyString(value.from_id)
    && hasNonEmptyString(value.to_id)
    && hasNonEmptyString(value.type)
    && (value.properties === undefined || isRecord(value.properties))
}

export function isMemoryExtractionBundle(value: unknown): value is MemoryExtractionBundle {
  const graph = isRecord(value) && isRecord(value.graph) ? value.graph : null
  return isRecord(value)
    && hasNonEmptyString(value.extraction_version)
    && hasNonEmptyString(value.extractor)
    && hasNonEmptyString(value.generated_at)
    && hasNonEmptyString(value.project)
    && hasNonEmptyString(value.session_id)
    && isSourceAsset(value.source_asset)
    && Array.isArray(value.memory_units)
    && value.memory_units.every(isMemoryUnit)
    && isArchiveAnchor(value.archive_anchor)
    && graph !== null
    && Array.isArray(graph.nodes)
    && graph.nodes.every(isMemoryGraphNode)
    && Array.isArray(graph.edges)
    && graph.edges.every(isMemoryGraphEdge)
}

export function isDataLayerSearchHit(value: unknown): value is DataLayerSearchHit {
  return isRecord(value)
    && isRetrievalReference(value.ref)
    && (value.session === undefined || isSessionRecord(value.session))
    && (value.memory_unit === undefined || isMemoryUnit(value.memory_unit))
    && (value.source_asset === undefined || isSourceAsset(value.source_asset))
    && (value.archive_anchor === undefined || isArchiveAnchor(value.archive_anchor))
}

export function isDataLayerSearchResponse(value: unknown): value is DataLayerSearchResponse {
  return isRecord(value)
    && isDataLayerSearchQuery(value.query)
    && Array.isArray(value.hits)
    && value.hits.every(isDataLayerSearchHit)
}

export function isEntityGraphNodeView(value: unknown): value is EntityGraphNodeView {
  return isRecord(value)
    && hasNonEmptyString(value.id)
    && isStringArray(value.labels)
    && isRecord(value.properties)
}

export function isEntityGraphEdgeView(value: unknown): value is EntityGraphEdgeView {
  return isRecord(value)
    && hasNonEmptyString(value.from_id)
    && hasNonEmptyString(value.to_id)
    && hasNonEmptyString(value.type)
    && (value.properties === undefined || isRecord(value.properties))
}

export function isEntityGraphView(value: unknown): value is EntityGraphView {
  return isRecord(value)
    && isRecordArray(value.nodes)
    && value.nodes.every(isEntityGraphNodeView)
    && isRecordArray(value.edges)
    && value.edges.every(isEntityGraphEdgeView)
}

export function isCommitContext(value: unknown): value is CommitContext {
  return isRecord(value)
    && hasNonEmptyString(value.session_id)
    && isStringArray(value.commit_refs)
    && isOptionalString(value.commit_layer)
}

export function normalizeRetrievalQuery(
  value: string | RetrievalQuery,
  defaults: Partial<Pick<RetrievalQuery, 'limit' | 'scope'>> = {},
): RetrievalQuery {
  const raw = typeof value === 'string' ? { text: value } : value
  const text = raw.text.trim()
  if (!text) {
    throw new Error('Retrieval query text must not be empty')
  }

  const limit = raw.limit ?? defaults.limit
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 0)) {
    throw new Error(`Retrieval query limit must be a non-negative finite number, received ${String(limit)}`)
  }

  const scope = raw.scope ?? defaults.scope
  if (scope !== undefined && !isRetrievalScope(scope)) {
    throw new Error('Retrieval query scope is invalid')
  }

  return {
    text,
    ...(limit !== undefined ? { limit } : {}),
    ...(scope !== undefined ? { scope } : {}),
  }
}

export function normalizeDataLayerSearchQuery(
  value: string | DataLayerSearchQuery,
  defaults: Partial<Pick<DataLayerSearchQuery, 'limit' | 'scope' | 'target'>> = {},
): DataLayerSearchQuery {
  const raw = typeof value === 'string' ? { text: value } : value
  const base = normalizeRetrievalQuery(raw, defaults)
  const target = raw.target ?? defaults.target ?? 'mixed'
  if (!isDataLayerSearchTarget(target)) {
    throw new Error(`DataLayer search target is invalid: ${String(target)}`)
  }

  return {
    ...base,
    target,
  }
}

export function toEffectiveRetrievalLimit(limit?: number): number {
  if (limit === undefined || limit === 0) {
    return Number.MAX_SAFE_INTEGER
  }
  if (!Number.isFinite(limit) || limit < 0) {
    throw new Error(`Retrieval limit must be a non-negative finite number, received ${String(limit)}`)
  }
  return limit
}

export function compareRetrievalReferences(left: RetrievalReference, right: RetrievalReference): number {
  const leftScore = left.score ?? Number.NEGATIVE_INFINITY
  const rightScore = right.score ?? Number.NEGATIVE_INFINITY
  return rightScore - leftScore
    || left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id)
}

export function dedupeRetrievalReferences(results: RetrievalReference[]): RetrievalReference[] {
  const deduped = new Map<string, RetrievalReference>()
  for (const result of [...results].sort(compareRetrievalReferences)) {
    const key = `${result.kind}\u0000${result.id}`
    if (!deduped.has(key)) deduped.set(key, result)
  }
  return [...deduped.values()]
}
