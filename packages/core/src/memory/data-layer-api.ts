import type {
  ArchiveAnchor,
  CommitContext,
  DataLayerListSessionsFilter,
  DataLayerListSessionsPage,
  DataLayerSearchHit,
  DataLayerSearchQuery,
  DataLayerSearchResponse,
  EntityGraphView,
  MemoryUnit,
  RetrievalReference,
  RetrievalTools,
  SessionDetail,
  SourceAsset,
} from '@openmnemo/types'

import {
  compareRetrievalReferences,
  dedupeRetrievalReferences,
  normalizeDataLayerSearchQuery,
  toEffectiveRetrievalLimit,
} from './domain.js'

export interface DataLayerAPI {
  search(query: DataLayerSearchQuery): Promise<DataLayerSearchResponse>
  getSession(id: string): Promise<SessionDetail | null>
  listSessions(filter?: DataLayerListSessionsFilter): Promise<DataLayerListSessionsPage>
  getCommitContext(sessionId: string): Promise<CommitContext | null>
  getEntityGraph(entityName: string): Promise<EntityGraphView>
}

export interface DataLayerDependencies {
  retrieval: RetrievalTools
  getSession(id: string): Promise<SessionDetail | null>
  listSessions(filter?: DataLayerListSessionsFilter): Promise<DataLayerListSessionsPage>
  getCommitContext(sessionId: string): Promise<CommitContext | null>
  getEntityGraph(entityName: string): Promise<EntityGraphView>
  getSessionForRef?(ref: RetrievalReference): Promise<SessionDetail | null>
  getMemoryUnit?(id: string): Promise<MemoryUnit | null>
  getSourceAsset?(id: string): Promise<SourceAsset | null>
  getArchiveAnchor?(id: string): Promise<ArchiveAnchor | null>
}

function mixedCandidateLimit(limit?: number): number {
  const effectiveLimit = toEffectiveRetrievalLimit(limit)
  if (effectiveLimit === Number.MAX_SAFE_INTEGER) return effectiveLimit
  return Math.min(Math.max(effectiveLimit * 4, effectiveLimit), 200)
}

async function runSearch(
  retrieval: RetrievalTools,
  query: DataLayerSearchQuery,
): Promise<RetrievalReference[]> {
  const executionQuery = query.limit === 0
    ? { ...query, limit: toEffectiveRetrievalLimit(query.limit) }
    : query

  switch (query.target) {
    case 'session':
      return retrieval.searchSessions(executionQuery)
    case 'memory_unit':
      return retrieval.searchMemoryUnits(executionQuery)
    case 'source_asset':
      return retrieval.searchSourceAssets ? retrieval.searchSourceAssets(executionQuery) : []
    case 'archive_anchor':
      return retrieval.searchArchiveAnchors ? retrieval.searchArchiveAnchors(executionQuery) : []
    case 'mixed': {
      const effectiveLimit = toEffectiveRetrievalLimit(query.limit)
      const candidateQuery = {
        ...executionQuery,
        limit: mixedCandidateLimit(query.limit),
      }
      const results = await Promise.all([
        retrieval.searchSessions(candidateQuery),
        retrieval.searchMemoryUnits(candidateQuery),
        retrieval.searchSourceAssets ? retrieval.searchSourceAssets(candidateQuery) : Promise.resolve([]),
        retrieval.searchArchiveAnchors ? retrieval.searchArchiveAnchors(candidateQuery) : Promise.resolve([]),
      ])
      return dedupeRetrievalReferences(results.flat())
        .sort(compareRetrievalReferences)
        .slice(0, mixedCandidateLimit(effectiveLimit))
    }
  }

  return []
}

async function hydrateSearchHit(
  deps: DataLayerDependencies,
  ref: RetrievalReference,
): Promise<DataLayerSearchHit> {
  switch (ref.kind) {
    case 'session': {
      const session = await deps.getSession(ref.id)
      return session ? { ref, session } : { ref }
    }
    case 'memory_unit': {
      const memoryUnit = deps.getMemoryUnit ? await deps.getMemoryUnit(ref.id) : null
      const session = deps.getSessionForRef ? await deps.getSessionForRef(ref) : null
      return {
        ref,
        ...(memoryUnit ? { memory_unit: memoryUnit } : {}),
        ...(session ? { session } : {}),
      }
    }
    case 'source_asset': {
      const sourceAsset = deps.getSourceAsset
        ? await deps.getSourceAsset(ref.id)
        : await deps.retrieval.getSourceAsset(ref.id)
      const session = deps.getSessionForRef ? await deps.getSessionForRef(ref) : null
      return {
        ref,
        ...(sourceAsset ? { source_asset: sourceAsset } : {}),
        ...(session ? { session } : {}),
      }
    }
    case 'archive_anchor': {
      const archiveAnchor = deps.getArchiveAnchor
        ? await deps.getArchiveAnchor(ref.id)
        : await deps.retrieval.getArchiveAnchor(ref.id)
      const session = deps.getSessionForRef ? await deps.getSessionForRef(ref) : null
      return {
        ref,
        ...(archiveAnchor ? { archive_anchor: archiveAnchor } : {}),
        ...(session ? { session } : {}),
      }
    }
    case 'commit':
      return { ref }
  }
}

function mixedHitPriority(hit: DataLayerSearchHit): number {
  switch (hit.ref.kind) {
    case 'memory_unit':
      return 0
    case 'source_asset':
      return 1
    case 'archive_anchor':
      return 2
    case 'session':
      return 3
    case 'commit':
      return 4
  }
}

function compareMixedHits(left: DataLayerSearchHit, right: DataLayerSearchHit): number {
  return mixedHitPriority(left) - mixedHitPriority(right)
    || compareRetrievalReferences(left.ref, right.ref)
}

function normalizeMixedHits(
  hits: DataLayerSearchHit[],
  limit?: number,
): DataLayerSearchHit[] {
  const coveredSessions = new Set(
    hits
      .filter((hit) => hit.ref.kind !== 'session' && typeof hit.session?.session_id === 'string')
      .map((hit) => hit.session!.session_id),
  )

  return hits
    .filter((hit) => !(hit.ref.kind === 'session'
      && typeof hit.session?.session_id === 'string'
      && coveredSessions.has(hit.session.session_id)))
    .sort(compareMixedHits)
    .slice(0, toEffectiveRetrievalLimit(limit))
}

export function createDataLayerAPI(deps: DataLayerDependencies): DataLayerAPI {
  return {
    async search(query: DataLayerSearchQuery): Promise<DataLayerSearchResponse> {
      const normalized = normalizeDataLayerSearchQuery(query)
      const refs = await runSearch(deps.retrieval, normalized)
      const hits = await Promise.all(refs.map((ref) => hydrateSearchHit(deps, ref)))
      return {
        query: normalized,
        hits: normalized.target === 'mixed'
          ? normalizeMixedHits(hits, normalized.limit)
          : hits,
      }
    },

    getSession(id: string): Promise<SessionDetail | null> {
      return deps.getSession(id)
    },

    listSessions(filter?: DataLayerListSessionsFilter): Promise<DataLayerListSessionsPage> {
      return deps.listSessions(filter)
    },

    getCommitContext(sessionId: string): Promise<CommitContext | null> {
      return deps.getCommitContext(sessionId)
    },

    getEntityGraph(entityName: string): Promise<EntityGraphView> {
      return deps.getEntityGraph(entityName)
    },
  }
}
