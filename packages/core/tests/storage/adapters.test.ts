import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'

import { SqliteFtsAdapter } from '../../src/storage/search/sqlite-fts-adapter.js'
import { SqliteVecAdapter } from '../../src/storage/vector/sqlite-vec-adapter.js'
import { SqliteGraphAdapter } from '../../src/storage/graph/sqlite-graph-adapter.js'
import { createSearchAdapter, createVectorAdapter, createGraphAdapter } from '../../src/storage/factory.js'
import type { ManifestEntry } from '@openmnemo/types'

function makeManifest(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    client: 'claude',
    project: 'my-project',
    session_id: 'sess-001',
    raw_sha256: 'abc123def456',
    title: 'Test Session',
    started_at: '2024-06-01T00:00:00Z',
    imported_at: '2024-06-01T01:00:00Z',
    cwd: '/home/user/project',
    branch: 'main',
    raw_source_path: '/raw/source.jsonl',
    raw_upload_permission: 'granted',
    global_raw_path: '/global/raw/file.jsonl',
    global_clean_path: '/global/clean/file.md',
    global_manifest_path: '/global/manifests/file.json',
    repo_raw_path: '.memorytree/raw/file.jsonl',
    repo_clean_path: '.memorytree/clean/file.md',
    repo_manifest_path: '.memorytree/manifests/file.json',
    message_count: 5,
    tool_event_count: 2,
    cleaning_mode: 'deterministic-code',
    repo_mirror_enabled: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// SqliteFtsAdapter
// ---------------------------------------------------------------------------

describe('SqliteFtsAdapter', () => {
  let tmpDir: string
  let dbPath: string
  let adapter: SqliteFtsAdapter

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fts-adapter-test-'))
    dbPath = join(tmpDir, 'search.sqlite')
    adapter = new SqliteFtsAdapter(dbPath)
  })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('upsert + search round-trip finds the record', () => {
    adapter.upsert(makeManifest({ title: 'authentication flow' }))
    const results = adapter.search('authentication')
    expect(results).toHaveLength(1)
    expect(results[0]!.title).toBe('authentication flow')
  })

  it('search returns empty array when db does not exist', () => {
    const missing = new SqliteFtsAdapter(join(tmpDir, 'nonexistent.sqlite'))
    expect(missing.search('anything')).toEqual([])
  })

  it('search respects options.limit', () => {
    for (let i = 0; i < 5; i++) {
      adapter.upsert(makeManifest({ session_id: `sess-${i}`, title: `session number ${i}` }))
    }
    const results = adapter.search('session', { limit: 3 })
    expect(results).toHaveLength(3)
  })

  it('close() does not throw', () => {
    expect(() => adapter.close()).not.toThrow()
  })

  it('upsert is idempotent — same manifest twice = one row', () => {
    const m = makeManifest({ title: 'idempotent test' })
    adapter.upsert(m)
    adapter.upsert(m)
    expect(adapter.search('idempotent')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

describe('createSearchAdapter', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'factory-test-')) })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('returns a SqliteFtsAdapter instance', () => {
    const adapter = createSearchAdapter({ indexDir: tmpDir })
    expect(adapter).toBeInstanceOf(SqliteFtsAdapter)
  })

  it('returned adapter can upsert and search without throwing', () => {
    const adapter = createSearchAdapter({ indexDir: tmpDir })
    adapter.upsert(makeManifest({ title: 'factory search test' }))
    expect(adapter.search('factory')).toHaveLength(1)
  })
})

describe('createVectorAdapter', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'vector-factory-test-')) })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('returns a SqliteVecAdapter by default', () => {
    const adapter = createVectorAdapter({ indexDir: tmpDir, vector_backend: 'sqlite-vec' })
    expect(adapter).toBeInstanceOf(SqliteVecAdapter)
    adapter.close()
  })

  it('default sqlite vector adapter can upsert, search, and delete', () => {
    const adapter = createVectorAdapter({ indexDir: tmpDir, embedding_dims: 2 })
    try {
      adapter.upsert('auth', [1, 0], { label: 'auth' })
      adapter.upsert('billing', [0, 1], { label: 'billing' })

      const results = adapter.search([0.9, 0.1], 2)
      expect(results).toHaveLength(2)
      expect(results[0]!.id).toBe('auth')
      expect(results[0]!.metadata).toEqual({ label: 'auth' })
      expect(results[0]!.score).toBeGreaterThan(results[1]!.score)

      adapter.delete('auth')
      expect(adapter.search([1, 0], 5).map(result => result.id)).toEqual(['billing'])
    } finally {
      adapter.close()
    }
  })

  it('migrates legacy JSON vector rows into sqlite-vec tables', () => {
    const dbPath = join(tmpDir, 'search.sqlite')
    const db = new Database(dbPath)
    try {
      db.exec(`
        CREATE TABLE vec_sessions (
          id TEXT PRIMARY KEY,
          embedding TEXT NOT NULL,
          metadata TEXT NOT NULL DEFAULT '{}'
        )
      `)
      db.prepare(`
        INSERT INTO vec_sessions (id, embedding, metadata)
        VALUES (?, ?, ?)
      `).run('legacy-auth', JSON.stringify([1, 0]), JSON.stringify({ source: 'legacy' }))
    } finally {
      db.close()
    }

    const adapter = new SqliteVecAdapter(dbPath, { embeddingDimensions: 2 })
    try {
      const results = adapter.search([1, 0], 5)
      expect(results).toHaveLength(1)
      expect(results[0]!.id).toBe('legacy-auth')
      expect(results[0]!.metadata).toEqual({ source: 'legacy' })
    } finally {
      adapter.close()
    }
  })

  it('refuses to auto-drop vec0 data when embedding dimensions change', () => {
    const dbPath = join(tmpDir, 'search.sqlite')
    const writer = new SqliteVecAdapter(dbPath, { embeddingDimensions: 2 })
    try {
      writer.upsert('auth', [1, 0], { label: 'auth' })
    } finally {
      writer.close()
    }

    expect(() => new SqliteVecAdapter(dbPath, { embeddingDimensions: 3 }))
      .toThrow('refusing to auto-drop vector data')

    const reader = new SqliteVecAdapter(dbPath, { embeddingDimensions: 2 })
    try {
      const results = reader.search([1, 0], 5)
      expect(results).toHaveLength(1)
      expect(results[0]!.id).toBe('auth')
    } finally {
      reader.close()
    }
  })

  it('preserves legacy rows when migration validation fails', () => {
    const dbPath = join(tmpDir, 'search.sqlite')
    const db = new Database(dbPath)
    try {
      db.exec(`
        CREATE TABLE vec_sessions (
          id TEXT PRIMARY KEY,
          embedding TEXT NOT NULL,
          metadata TEXT NOT NULL DEFAULT '{}'
        )
      `)
      db.prepare(`
        INSERT INTO vec_sessions (id, embedding, metadata)
        VALUES (?, ?, ?)
      `).run('bad-legacy', JSON.stringify([1]), JSON.stringify({ source: 'legacy' }))
    } finally {
      db.close()
    }

    expect(() => new SqliteVecAdapter(dbPath, { embeddingDimensions: 2 }))
      .toThrow('cannot migrate legacy embedding')

    const verifyDb = new Database(dbPath, { readonly: true })
    try {
      const row = verifyDb.prepare(`
        SELECT id, embedding, metadata
        FROM vec_sessions
      `).get() as { id: string, embedding: string, metadata: string }
      expect(row.id).toBe('bad-legacy')
      expect(row.embedding).toBe('[1]')
      expect(row.metadata).toBe('{"source":"legacy"}')
    } finally {
      verifyDb.close()
    }
  })

  it('rejects embeddings with the wrong dimension', () => {
    const adapter = new SqliteVecAdapter(join(tmpDir, 'search.sqlite'), { embeddingDimensions: 3 })
    try {
      expect(() => adapter.upsert('bad', [1, 0], { label: 'bad' }))
        .toThrow('expected embedding length 3')
      expect(() => adapter.search([1, 0], 5))
        .toThrow('expected embedding length 3')
    } finally {
      adapter.close()
    }
  })

  it('throws for qdrant (constructor throws Phase 1)', () => {
    expect(() => createVectorAdapter({ indexDir: '/tmp', vector_backend: 'qdrant' }))
      .toThrow('not implemented in Phase 1')
  })
})

describe('createGraphAdapter', () => {
  let tmpDir: string

  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'graph-factory-test-')) })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('returns a SqliteGraphAdapter by default', () => {
    const adapter = createGraphAdapter({ indexDir: tmpDir, graph_backend: 'sqlite' })
    expect(adapter).toBeInstanceOf(SqliteGraphAdapter)
    adapter.close()
  })

  it('default sqlite graph adapter can upsert and traverse related nodes', () => {
    const adapter = createGraphAdapter({ indexDir: tmpDir })
    try {
      adapter.upsertNode({ id: 'project:openmnemo', labels: ['Project'], properties: { name: 'OpenMnemo' } })
      adapter.upsertNode({ id: 'tech:sqlite', labels: ['Technology'], properties: { name: 'SQLite' } })
      adapter.upsertNode({ id: 'concept:memory', labels: ['Concept'], properties: { name: 'Memory' } })
      adapter.upsertEdge({ fromId: 'project:openmnemo', toId: 'tech:sqlite', type: 'USES' })
      adapter.upsertEdge({ fromId: 'tech:sqlite', toId: 'concept:memory', type: 'ENABLES' })

      const depthOne = adapter.findRelated('project:openmnemo', 1)
      expect(depthOne.map(node => node.id)).toEqual(['tech:sqlite'])

      const depthTwo = adapter.findRelated('project:openmnemo', 2)
      expect(depthTwo.map(node => node.id)).toEqual(['tech:sqlite', 'concept:memory'])

      const rows = adapter.query('SELECT COUNT(*) AS count FROM graph_nodes') as Array<{ count: number }>
      expect(rows[0]!.count).toBe(3)
    } finally {
      adapter.close()
    }
  })

  it('throws for neo4j (constructor throws Phase 1)', () => {
    expect(() => createGraphAdapter({ indexDir: '/tmp', graph_backend: 'neo4j' }))
      .toThrow('not implemented in Phase 1')
  })
})
