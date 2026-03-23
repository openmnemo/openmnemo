import { describe, expect, it } from 'vitest'
import type {
  ArchiveAnchor,
  DataLayerListSessionsPage,
  DataLayerSearchQuery,
  EntityGraphView,
  MemoryUnit,
  RetrievalReference,
  RetrievalTools,
  SessionDetail,
  SourceAsset,
} from '@openmnemo/types'

import {
  MEMORY_UNIT_TYPES,
  createDataLayerAPI,
  dedupeRetrievalReferences,
  isDataLayerSearchResponse,
  isMemoryUnit,
  normalizeDataLayerSearchQuery,
  normalizeRetrievalQuery,
  toEffectiveRetrievalLimit,
} from '../../src/index.js'

function buildMemoryUnit(overrides: Partial<MemoryUnit> = {}): MemoryUnit {
  return {
    id: 'unit-001',
    unit_type: 'decision',
    title: 'Prefer better-sqlite3',
    body: 'Prefer better-sqlite3 for local-first SQLite runtime work.',
    project: 'openmnemo',
    source_kind: 'transcript',
    source_id: 'session-001',
    source_asset_ids: ['asset-001'],
    status: 'active',
    created_at: '2026-03-22T00:00:00Z',
    updated_at: '2026-03-22T00:00:00Z',
    ...overrides,
  }
}

function buildSession(id: string, overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    client: 'claude',
    project: 'openmnemo',
    session_id: id,
    title: `Session ${id}`,
    cwd: '/workspace/openmnemo',
    branch: 'main',
    started_at: '2026-03-22T00:00:00Z',
    ...overrides,
  }
}

function buildSourceAsset(overrides: Partial<SourceAsset> = {}): SourceAsset {
  return {
    id: 'asset-001',
    asset_kind: 'transcript',
    project: 'openmnemo',
    created_at: '2026-03-22T00:00:00Z',
    updated_at: '2026-03-22T00:00:00Z',
    ...overrides,
  }
}

function buildArchiveAnchor(overrides: Partial<ArchiveAnchor> = {}): ArchiveAnchor {
  return {
    id: 'anchor-001',
    scope: 'session',
    title: 'Session anchor',
    summary: 'Compressed retrieval entry point.',
    project: 'openmnemo',
    source_asset_ids: ['asset-001'],
    memory_unit_ids: ['unit-001'],
    created_at: '2026-03-22T00:00:00Z',
    updated_at: '2026-03-22T00:00:00Z',
    ...overrides,
  }
}

describe('memory domain helpers', () => {
  it('exports the expected memory unit kinds', () => {
    expect(MEMORY_UNIT_TYPES).toContain('decision')
    expect(MEMORY_UNIT_TYPES).toContain('document_chunk')
  })

  it('validates a well-formed memory unit', () => {
    expect(isMemoryUnit(buildMemoryUnit())).toBe(true)
    expect(isMemoryUnit({ id: 'broken', unit_type: 'decision' })).toBe(false)
  })

  it('normalizes retrieval query text and defaults', () => {
    expect(normalizeRetrievalQuery('  archive anchor  ', { limit: 5 })).toEqual({
      text: 'archive anchor',
      limit: 5,
    })

    expect(normalizeDataLayerSearchQuery({ text: '  memory unit  ' })).toEqual({
      text: 'memory unit',
      target: 'mixed',
    })
  })

  it('treats limit=0 as no limit for effective retrieval execution', () => {
    expect(toEffectiveRetrievalLimit()).toBe(Number.MAX_SAFE_INTEGER)
    expect(toEffectiveRetrievalLimit(0)).toBe(Number.MAX_SAFE_INTEGER)
    expect(toEffectiveRetrievalLimit(5)).toBe(5)
    expect(() => toEffectiveRetrievalLimit(-1)).toThrow(/non-negative finite number/i)
  })

  it('dedupes retrieval references by kind and id while keeping the strongest score', () => {
    const deduped = dedupeRetrievalReferences([
      { kind: 'session', id: 'sess-1', score: 0.3 },
      { kind: 'session', id: 'sess-1', score: 0.9 },
      { kind: 'memory_unit', id: 'unit-1', score: 0.7 },
    ])

    expect(deduped).toEqual([
      { kind: 'session', id: 'sess-1', score: 0.9 },
      { kind: 'memory_unit', id: 'unit-1', score: 0.7 },
    ])
  })
})

describe('createDataLayerAPI', () => {
  const sessionRef: RetrievalReference = {
    kind: 'session',
    id: 'sess-1',
    score: 0.9,
    source: 'mixed',
  }
  const sessionRefLower: RetrievalReference = {
    kind: 'session',
    id: 'sess-1',
    score: 0.2,
    source: 'fts',
  }
  const unitRef: RetrievalReference = {
    kind: 'memory_unit',
    id: 'unit-1',
    score: 0.8,
    source: 'vector',
  }
  const assetRef: RetrievalReference = {
    kind: 'source_asset',
    id: 'asset-1',
    score: 0.5,
    source: 'graph',
  }
  const anchorRef: RetrievalReference = {
    kind: 'archive_anchor',
    id: 'anchor-1',
    score: 0.4,
    source: 'mixed',
  }

  function createDeps() {
    const retrieval: RetrievalTools = {
      searchSessions: async () => [sessionRef, sessionRefLower],
      searchMemoryUnits: async () => [unitRef],
      searchSourceAssets: async () => [assetRef],
      searchArchiveAnchors: async () => [anchorRef],
      getSourceAsset: async (id: string) => buildSourceAsset({ id }),
      getArchiveAnchor: async (id: string) => buildArchiveAnchor({ id }),
    }

    const listSessionsPage: DataLayerListSessionsPage = {
      items: [buildSession('sess-1')],
    }
    const graphView: EntityGraphView = {
      nodes: [{ id: 'entity:sqlite', labels: ['Technology'], properties: { name: 'sqlite' } }],
      edges: [],
    }

    return {
      retrieval,
      getSession: async (id: string) => buildSession(id),
      listSessions: async () => listSessionsPage,
      getCommitContext: async (sessionId: string) => ({ session_id: sessionId, commit_refs: ['abc123'] }),
      getEntityGraph: async () => graphView,
      getSessionForRef: async (ref: RetrievalReference) =>
        ref.kind === 'session' ? buildSession(ref.id) : buildSession('sess-1'),
      getMemoryUnit: async (id: string) => buildMemoryUnit({ id }),
    }
  }

  it('builds a mixed search response with hydrated hits', async () => {
    const api = createDataLayerAPI(createDeps())
    const query: DataLayerSearchQuery = { text: '  sqlite memory  ', target: 'mixed', limit: 10 }

    const result = await api.search(query)

    expect(isDataLayerSearchResponse(result)).toBe(true)
    expect(result.query).toEqual({ text: 'sqlite memory', target: 'mixed', limit: 10 })
    expect(result.hits.map((hit) => hit.ref.id)).toEqual(['unit-1', 'asset-1', 'anchor-1'])
    expect(result.hits[0]?.memory_unit?.id).toBe('unit-1')
    expect(result.hits[0]?.session?.session_id).toBe('sess-1')
    expect(result.hits[1]?.source_asset?.id).toBe('asset-1')
    expect(result.hits[1]?.session?.session_id).toBe('sess-1')
    expect(result.hits[2]?.archive_anchor?.id).toBe('anchor-1')
    expect(result.hits[2]?.session?.session_id).toBe('sess-1')
  })

  it('keeps mixed search results when limit=0', async () => {
    const api = createDataLayerAPI(createDeps())

    const result = await api.search({ text: 'sqlite memory', target: 'mixed', limit: 0 })

    expect(result.hits.map((hit) => hit.ref.id)).toEqual(['unit-1', 'asset-1', 'anchor-1'])
  })

  it('passes an effective limit to direct target searches when limit=0', async () => {
    let observedLimit: number | undefined
    const api = createDataLayerAPI({
      ...createDeps(),
      retrieval: {
        ...createDeps().retrieval,
        searchSessions: async (query) => {
          observedLimit = query.limit
          return [sessionRef]
        },
      },
    })

    const result = await api.search({ text: 'sqlite memory', target: 'session', limit: 0 })

    expect(observedLimit).toBe(Number.MAX_SAFE_INTEGER)
    expect(result.hits.map((hit) => hit.ref.id)).toEqual(['sess-1'])
  })

  it('delegates direct getters to the configured data layer dependencies', async () => {
    const api = createDataLayerAPI(createDeps())

    await expect(api.getSession('sess-9')).resolves.toEqual(buildSession('sess-9'))
    await expect(api.listSessions()).resolves.toEqual({ items: [buildSession('sess-1')] })
    await expect(api.getCommitContext('sess-9')).resolves.toEqual({ session_id: 'sess-9', commit_refs: ['abc123'] })
    await expect(api.getEntityGraph('sqlite')).resolves.toEqual({
      nodes: [{ id: 'entity:sqlite', labels: ['Technology'], properties: { name: 'sqlite' } }],
      edges: [],
    })
  })

  it('keeps session hits in mixed mode when no structured hit can resolve back to a session', async () => {
    const api = createDataLayerAPI({
      ...createDeps(),
      getSessionForRef: async (ref: RetrievalReference) =>
        ref.kind === 'session' ? buildSession(ref.id) : null,
    })

    const result = await api.search({ text: 'sqlite memory', target: 'mixed', limit: 10 })

    expect(result.hits.map((hit) => hit.ref.id)).toEqual(['unit-1', 'asset-1', 'anchor-1', 'sess-1'])
    expect(result.hits[3]?.session?.session_id).toBe('sess-1')
  })
})
