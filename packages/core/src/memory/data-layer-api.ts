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
  getMemoryUnit?(id: string): Promise<MemoryUnit | null>
  getSourceAsset?(id: string): Promise<SourceAsset | null>
  getArchiveAnchor?(id: string): Promise<ArchiveAnchor | null>
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
      const results = await Promise.all([
        retrieval.searchSessions(executionQuery),
        retrieval.searchMemoryUnits(executionQuery),
        retrieval.searchSourceAssets ? retrieval.searchSourceAssets(executionQuery) : Promise.resolve([]),
        retrieval.searchArchiveAnchors ? retrieval.searchArchiveAnchors(executionQuery) : Promise.resolve([]),
      ])
      return dedupeRetrievalReferences(results.flat())
        .sort(compareRetrievalReferences)
        .slice(0, effectiveLimit)
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
      return memoryUnit ? { ref, memory_unit: memoryUnit } : { ref }
    }
    case 'source_asset': {
      const sourceAsset = deps.getSourceAsset
        ? await deps.getSourceAsset(ref.id)
        : await deps.retrieval.getSourceAsset(ref.id)
      return sourceAsset ? { ref, source_asset: sourceAsset } : { ref }
    }
    case 'archive_anchor': {
      const archiveAnchor = deps.getArchiveAnchor
        ? await deps.getArchiveAnchor(ref.id)
        : await deps.retrieval.getArchiveAnchor(ref.id)
      return archiveAnchor ? { ref, archive_anchor: archiveAnchor } : { ref }
    }
    case 'commit':
      return { ref }
  }
}

export function createDataLayerAPI(deps: DataLayerDependencies): DataLayerAPI {
  return {
    async search(query: DataLayerSearchQuery): Promise<DataLayerSearchResponse> {
      const normalized = normalizeDataLayerSearchQuery(query)
      const refs = await runSearch(deps.retrieval, normalized)
      const hits = await Promise.all(refs.map((ref) => hydrateSearchHit(deps, ref)))
      return { query: normalized, hits }
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
