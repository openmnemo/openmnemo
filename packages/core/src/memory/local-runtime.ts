import { existsSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import type {
  ArchiveAnchor,
  CommitContext,
  DataLayerListSessionsFilter,
  DataLayerListSessionsPage,
  EntityGraphEdgeView,
  EntityGraphNodeView,
  EntityGraphView,
  RetrievalQuery,
  RetrievalReference,
  RetrievalTools,
  SessionDetail,
  SessionRecord,
  SourceAsset,
} from '@openmnemo/types'

import { searchRecall } from '../recall/recall.js'
import { createGraphAdapter } from '../storage/factory.js'
import {
  DEFAULT_VECTOR_DIMS,
  deterministicTextEmbedding,
  isZeroVector,
} from '../storage/vector/deterministic.js'
import { getArchiveAnchor, getMemoryUnit, getSourceAsset, listMemoryExtractionBundles } from './catalog.js'
import { createDataLayerAPI, type DataLayerAPI } from './data-layer-api.js'
import type { MemoryExtractionBundle } from './extraction.js'
import { normalizeRetrievalQuery, toEffectiveRetrievalLimit } from './domain.js'
import { searchMemoryUnitVectors } from './vector.js'

export interface LocalDataLayerOptions {
  globalRoot: string
}

interface LocalTranscriptRow {
  client: string
  project: string
  session_id: string
  raw_sha256: string
  title: string
  started_at: string
  cwd: string
  branch: string
  global_clean_path: string
  content: string
  commit_layer: string
  message_count: number
  tool_event_count: number
}

interface CatalogCandidate<TValue> {
  value: TValue
  id: string
  kind: RetrievalReference['kind']
  project: string
  partition?: string
  session_id: string
  text: string
}

const DEFAULT_SESSION_PAGE_SIZE = 50
const LOCAL_SEARCH_CANDIDATE_CAP = 200
const LOCAL_SEARCH_CANDIDATE_FLOOR = 20
const LOCAL_SEARCH_CANDIDATE_MULTIPLIER = 4

function transcriptDbPath(globalRoot: string): string {
  return join(globalRoot, 'index', 'search.sqlite')
}

function sessionKey(value: Pick<SessionRecord, 'client' | 'project' | 'session_id'>): string {
  return `${value.client}\u0000${value.project}\u0000${value.session_id}`
}

function projectSessionKey(project: string, sessionId: string): string {
  return `${project}\u0000${sessionId}`
}

function effectiveCandidateLimit(limit: number): number {
  if (limit === Number.MAX_SAFE_INTEGER) return LOCAL_SEARCH_CANDIDATE_CAP
  return Math.min(
    Math.max(limit * LOCAL_SEARCH_CANDIDATE_MULTIPLIER, LOCAL_SEARCH_CANDIDATE_FLOOR),
    LOCAL_SEARCH_CANDIDATE_CAP,
  )
}

function effectiveSessionPageLimit(limit?: number): number {
  if (limit === undefined || limit <= 0 || !Number.isFinite(limit)) {
    return DEFAULT_SESSION_PAGE_SIZE
  }
  return Math.floor(limit)
}

function partitionFromStartedAt(startedAt: string): string | undefined {
  const partition = startedAt.slice(0, 7)
  return /^\d{4}-\d{2}$/.test(partition) ? partition : undefined
}

function cosineSimilarity(left: number[], right: number[]): number {
  let score = 0
  for (let index = 0; index < left.length; index++) {
    score += left[index]! * right[index]!
  }
  return score
}

function loadSessionRows(globalRoot: string): LocalTranscriptRow[] {
  const dbPath = transcriptDbPath(globalRoot)
  if (!existsSync(dbPath)) return []

  const db = new Database(dbPath, { readonly: true })
  try {
    const rows = db.prepare(`
      SELECT
        client,
        project,
        session_id,
        raw_sha256,
        title,
        started_at,
        cwd,
        branch,
        global_clean_path,
        content,
        commit_layer,
        message_count,
        tool_event_count
      FROM transcripts
      ORDER BY started_at DESC, client ASC, project ASC, session_id ASC
    `).all() as LocalTranscriptRow[]

    const deduped = new Map<string, LocalTranscriptRow>()
    for (const row of rows) {
      const key = sessionKey(row)
      if (!deduped.has(key)) deduped.set(key, row)
    }
    return [...deduped.values()]
  } catch {
    return []
  } finally {
    db.close()
  }
}

function toSessionRecord(row: LocalTranscriptRow): SessionRecord {
  return {
    client: row.client,
    project: row.project,
    session_id: row.session_id,
    title: row.title,
    cwd: row.cwd,
    branch: row.branch,
    started_at: row.started_at,
  }
}

function toSessionDetail(row: LocalTranscriptRow): SessionDetail {
  return {
    ...toSessionRecord(row),
    clean_content: row.content,
    clean_path: row.global_clean_path,
    commit_layer: row.commit_layer,
    message_count: row.message_count,
    tool_event_count: row.tool_event_count,
  }
}

function sessionScopeMatches(
  row: Pick<SessionRecord, 'project' | 'session_id' | 'started_at'>,
  scope?: RetrievalQuery['scope'],
): boolean {
  if (!scope) return true
  if (scope.project && row.project !== scope.project) return false
  if (scope.session_id && row.session_id !== scope.session_id) return false
  if (scope.partition && partitionFromStartedAt(row.started_at) !== scope.partition) return false
  return true
}

function candidateScopeMatches(
  candidate: Pick<CatalogCandidate<unknown>, 'project' | 'partition' | 'session_id'>,
  scope?: RetrievalQuery['scope'],
): boolean {
  if (!scope) return true
  if (scope.project && candidate.project !== scope.project) return false
  if (scope.partition && candidate.partition !== scope.partition) return false
  if (scope.session_id && candidate.session_id !== scope.session_id) return false
  return true
}

function latestBundleKey(bundle: MemoryExtractionBundle): string {
  return projectSessionKey(bundle.project, bundle.session_id)
}

function compareBundleFreshness(left: MemoryExtractionBundle, right: MemoryExtractionBundle): number {
  return left.generated_at.localeCompare(right.generated_at)
    || left.source_asset.updated_at.localeCompare(right.source_asset.updated_at)
}

function listLatestExtractionBundles(globalRoot: string): MemoryExtractionBundle[] {
  const latest = new Map<string, MemoryExtractionBundle>()
  for (const bundle of listMemoryExtractionBundles(globalRoot)) {
    const key = latestBundleKey(bundle)
    const current = latest.get(key)
    if (!current || compareBundleFreshness(current, bundle) < 0) {
      latest.set(key, bundle)
    }
  }
  return [...latest.values()]
}

function searchCatalogCandidates<TValue>(
  queryInput: string | RetrievalQuery,
  candidates: CatalogCandidate<TValue>[],
): RetrievalReference[] {
  const query = normalizeRetrievalQuery(queryInput)
  const limit = toEffectiveRetrievalLimit(query.limit)
  const queryEmbedding = deterministicTextEmbedding(query.text, DEFAULT_VECTOR_DIMS)
  if (isZeroVector(queryEmbedding)) return []

  return candidates
    .filter((candidate) => candidateScopeMatches(candidate, query.scope))
    .map((candidate) => ({
      candidate,
      score: cosineSimilarity(
        queryEmbedding,
        deterministicTextEmbedding(candidate.text, DEFAULT_VECTOR_DIMS),
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score
      || left.candidate.kind.localeCompare(right.candidate.kind)
      || left.candidate.id.localeCompare(right.candidate.id))
    .slice(0, limit)
    .map((entry) => ({
      kind: entry.candidate.kind,
      id: entry.candidate.id,
      score: entry.score,
      source: 'mixed',
      project: entry.candidate.project,
      ...(entry.candidate.partition ? { partition: entry.candidate.partition } : {}),
    }))
}

function buildSourceAssetCandidates(globalRoot: string): CatalogCandidate<SourceAsset>[] {
  return listLatestExtractionBundles(globalRoot).map((bundle) => ({
    value: bundle.source_asset,
    id: bundle.source_asset.id,
    kind: 'source_asset',
    project: bundle.source_asset.project,
    ...(bundle.source_asset.partition ? { partition: bundle.source_asset.partition } : {}),
    session_id: bundle.session_id,
    text: [bundle.source_asset.title, bundle.source_asset.text_content]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n'),
  }))
}

function buildArchiveAnchorCandidates(globalRoot: string): CatalogCandidate<ArchiveAnchor>[] {
  return listLatestExtractionBundles(globalRoot).map((bundle) => ({
    value: bundle.archive_anchor,
    id: bundle.archive_anchor.id,
    kind: 'archive_anchor',
    project: bundle.archive_anchor.project,
    ...(bundle.archive_anchor.partition ? { partition: bundle.archive_anchor.partition } : {}),
    session_id: bundle.session_id,
    text: [bundle.archive_anchor.title, bundle.archive_anchor.summary]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n'),
  }))
}

function findBundleForReference(globalRoot: string, ref: RetrievalReference): MemoryExtractionBundle | null {
  const latest = listLatestExtractionBundles(globalRoot)
  const allBundles = listMemoryExtractionBundles(globalRoot)
  const bundles = [...latest, ...allBundles]

  for (const bundle of bundles) {
    if (ref.kind === 'memory_unit' && bundle.memory_units.some((unit) => unit.id === ref.id)) {
      return bundle
    }
    if (ref.kind === 'source_asset' && bundle.source_asset.id === ref.id) {
      return bundle
    }
    if (ref.kind === 'archive_anchor' && bundle.archive_anchor.id === ref.id) {
      return bundle
    }
  }

  return null
}

function getSessionDetailByProjectSession(
  globalRoot: string,
  project: string,
  sessionId: string,
): SessionDetail | null {
  const row = loadSessionRows(globalRoot)
    .find((entry) => entry.project === project && entry.session_id === sessionId)
  return row ? toSessionDetail(row) : null
}

function getSessionDetailById(globalRoot: string, sessionId: string): SessionDetail | null {
  const row = loadSessionRows(globalRoot)
    .find((entry) => entry.session_id === sessionId)
  return row ? toSessionDetail(row) : null
}

function encodeSessionCursor(record: SessionRecord): string {
  return Buffer.from(sessionKey(record), 'utf-8').toString('base64url')
}

function decodeSessionCursor(cursor?: string): string | null {
  if (!cursor) return null
  try {
    return Buffer.from(cursor, 'base64url').toString('utf-8')
  } catch {
    return null
  }
}

function readGraphEdges(globalRoot: string, nodeIds: string[]): EntityGraphEdgeView[] {
  if (nodeIds.length === 0) return []

  const graph = createGraphAdapter({ indexDir: join(globalRoot, 'index') })
  try {
    const quotedIds = nodeIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ')
    const rows = graph.query(`
      SELECT from_id, to_id, type, properties
      FROM graph_edges
      WHERE from_id IN (${quotedIds})
        AND to_id IN (${quotedIds})
      ORDER BY from_id ASC, to_id ASC, type ASC
    `) as Array<{ from_id: string, to_id: string, type: string, properties: string }>

    return rows.map((row) => ({
      from_id: row.from_id,
      to_id: row.to_id,
      type: row.type,
      ...(typeof row.properties === 'string' && row.properties.trim()
        ? { properties: JSON.parse(row.properties) as Record<string, unknown> }
        : {}),
    }))
  } catch {
    return []
  } finally {
    graph.close()
  }
}

function toEntityGraphNode(node: { id: string, labels: string[], properties: Record<string, unknown> }): EntityGraphNodeView {
  return {
    id: node.id,
    labels: node.labels,
    properties: node.properties,
  }
}

async function getSessionForReference(
  globalRoot: string,
  ref: RetrievalReference,
): Promise<SessionDetail | null> {
  if (ref.kind === 'session') {
    return getSessionDetailById(globalRoot, ref.id)
  }

  const bundle = findBundleForReference(globalRoot, ref)
  if (!bundle) return null
  return getSessionDetailByProjectSession(globalRoot, bundle.project, bundle.session_id)
}

async function searchSessions(
  globalRoot: string,
  queryInput: RetrievalQuery,
): Promise<RetrievalReference[]> {
  const query = normalizeRetrievalQuery(queryInput)
  const limit = toEffectiveRetrievalLimit(query.limit)
  const candidates = searchRecall(
    globalRoot,
    query.text,
    effectiveCandidateLimit(limit),
  ).results

  return candidates
    .filter((result) => sessionScopeMatches(result, query.scope))
    .slice(0, limit)
    .map((result, index) => ({
      kind: 'session',
      id: result.session_id,
      score: 1 / (index + 1),
      source: 'mixed',
      project: result.project,
      ...(partitionFromStartedAt(result.started_at)
        ? { partition: partitionFromStartedAt(result.started_at)! }
        : {}),
    }))
}

async function listSessions(
  globalRoot: string,
  filter: DataLayerListSessionsFilter = {},
): Promise<DataLayerListSessionsPage> {
  const limit = effectiveSessionPageLimit(filter.limit)
  const cursorKey = decodeSessionCursor(filter.cursor)

  const rows = loadSessionRows(globalRoot)
    .map(toSessionRecord)
    .filter((row) => {
      if (filter.project && row.project !== filter.project) return false
      if (filter.client && row.client !== filter.client) return false
      if (filter.branch && row.branch !== filter.branch) return false
      if (filter.started_after && row.started_at <= filter.started_after) return false
      if (filter.started_before && row.started_at >= filter.started_before) return false
      return true
    })

  const startIndex = cursorKey
    ? rows.findIndex((row) => sessionKey(row) === cursorKey) + 1
    : 0
  const items = rows.slice(startIndex, startIndex + limit)
  const next = rows[startIndex + limit]

  return {
    items,
    ...(next ? { next_cursor: encodeSessionCursor(items[items.length - 1]!) } : {}),
  }
}

async function getCommitContext(globalRoot: string, sessionId: string): Promise<CommitContext | null> {
  const detail = getSessionDetailById(globalRoot, sessionId)
  if (!detail) return null

  const commitRefs = [...new Set(
    (detail.commit_layer ?? '')
      .match(/\b[0-9a-f]{7,40}\b/gi) ?? [],
  )]

  return {
    session_id: sessionId,
    commit_refs: commitRefs,
    ...(detail.commit_layer ? { commit_layer: detail.commit_layer } : {}),
  }
}

async function getEntityGraph(globalRoot: string, entityName: string): Promise<EntityGraphView> {
  const graph = createGraphAdapter({ indexDir: join(globalRoot, 'index') })
  try {
    const matches = graph.findNodesByEntity({ entityName, limit: 20 })
    if (matches.length === 0) {
      return { nodes: [], edges: [] }
    }

    const nodeMap = new Map<string, EntityGraphNodeView>()
    for (const match of matches) {
      nodeMap.set(match.id, toEntityGraphNode(match))
      for (const related of graph.findRelated(match.id, 1)) {
        if (!nodeMap.has(related.id)) {
          nodeMap.set(related.id, toEntityGraphNode(related))
        }
      }
    }

    const nodeIds = [...nodeMap.keys()]
    return {
      nodes: [...nodeMap.values()],
      edges: readGraphEdges(globalRoot, nodeIds),
    }
  } finally {
    graph.close()
  }
}

export function createLocalRetrievalTools(options: LocalDataLayerOptions): RetrievalTools {
  return {
    searchSessions(query: RetrievalQuery): Promise<RetrievalReference[]> {
      return searchSessions(options.globalRoot, query)
    },

    searchMemoryUnits(query: RetrievalQuery): Promise<RetrievalReference[]> {
      return Promise.resolve(searchMemoryUnitVectors(options.globalRoot, query))
    },

    searchSourceAssets(query: RetrievalQuery): Promise<RetrievalReference[]> {
      return Promise.resolve(searchCatalogCandidates(query, buildSourceAssetCandidates(options.globalRoot)))
    },

    searchArchiveAnchors(query: RetrievalQuery): Promise<RetrievalReference[]> {
      return Promise.resolve(searchCatalogCandidates(query, buildArchiveAnchorCandidates(options.globalRoot)))
    },

    getSourceAsset(id: string): Promise<SourceAsset | null> {
      return Promise.resolve(getSourceAsset(options.globalRoot, id))
    },

    getArchiveAnchor(id: string): Promise<ArchiveAnchor | null> {
      return Promise.resolve(getArchiveAnchor(options.globalRoot, id))
    },
  }
}

export function createLocalDataLayerAPI(options: LocalDataLayerOptions): DataLayerAPI {
  return createDataLayerAPI({
    retrieval: createLocalRetrievalTools(options),
    getSession(id: string): Promise<SessionDetail | null> {
      return Promise.resolve(getSessionDetailById(options.globalRoot, id))
    },
    listSessions(filter?: DataLayerListSessionsFilter): Promise<DataLayerListSessionsPage> {
      return listSessions(options.globalRoot, filter)
    },
    getCommitContext(sessionId: string): Promise<CommitContext | null> {
      return getCommitContext(options.globalRoot, sessionId)
    },
    getEntityGraph(entityName: string): Promise<EntityGraphView> {
      return getEntityGraph(options.globalRoot, entityName)
    },
    getSessionForRef(ref: RetrievalReference): Promise<SessionDetail | null> {
      return getSessionForReference(options.globalRoot, ref)
    },
    getMemoryUnit(id: string) {
      return Promise.resolve(getMemoryUnit(options.globalRoot, id))
    },
    getSourceAsset(id: string) {
      return Promise.resolve(getSourceAsset(options.globalRoot, id))
    },
    getArchiveAnchor(id: string) {
      return Promise.resolve(getArchiveAnchor(options.globalRoot, id))
    },
  })
}
