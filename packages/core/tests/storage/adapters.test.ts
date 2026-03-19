import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { SqliteFtsAdapter } from '../../src/storage/search/sqlite-fts-adapter.js'
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
  it('throws for sqlite-vec (Phase 1 not implemented)', () => {
    expect(() => createVectorAdapter({ indexDir: '/tmp', vector_backend: 'sqlite-vec' }))
      .toThrow('not implemented in Phase 1')
  })

  it('throws for qdrant (constructor throws Phase 1)', () => {
    expect(() => createVectorAdapter({ indexDir: '/tmp', vector_backend: 'qdrant' }))
      .toThrow('not implemented in Phase 1')
  })
})

describe('createGraphAdapter', () => {
  it('throws for sqlite (Phase 1 not implemented)', () => {
    expect(() => createGraphAdapter({ indexDir: '/tmp', graph_backend: 'sqlite' }))
      .toThrow('not implemented in Phase 1')
  })

  it('throws for neo4j (constructor throws Phase 1)', () => {
    expect(() => createGraphAdapter({ indexDir: '/tmp', graph_backend: 'neo4j' }))
      .toThrow('not implemented in Phase 1')
  })
})
