import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'

import { upsertSearchIndex, searchTranscripts, sanitizeFtsQuery, rebuildFtsIndex, initSchema } from '../../src/transcript/db.js'
import type { ManifestEntry } from '@openmnemo/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    repo_raw_path: '.memorytree/raw/file.jsonl',
    repo_clean_path: '.memorytree/clean/file.md',
    repo_manifest_path: '.memorytree/manifest.yaml',
    message_count: 42,
    tool_event_count: 7,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('upsertSearchIndex', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'db-test-'))
    dbPath = join(tmpDir, 'transcripts.db')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a new db file and inserts one record', () => {
    expect(existsSync(dbPath)).toBe(false)

    const manifest = makeManifest()
    upsertSearchIndex(dbPath, manifest)

    expect(existsSync(dbPath)).toBe(true)

    const db = new Database(dbPath, { readonly: true })
    try {
      const row = db.prepare('SELECT * FROM transcripts').get() as Record<string, unknown>
      expect(row['client']).toBe('claude')
      expect(row['title']).toBe('Test Session')
      expect(row['message_count']).toBe(42)
      expect(row['tool_event_count']).toBe(7)
    } finally {
      db.close()
    }
  })

  it('updates existing record on conflict (upsert)', () => {
    upsertSearchIndex(dbPath, makeManifest())
    upsertSearchIndex(dbPath, makeManifest({
      title: 'Updated Title',
      message_count: 100,
      tool_event_count: 20,
      branch: 'feature-x',
    }))

    const db = new Database(dbPath, { readonly: true })
    try {
      const rows = db.prepare('SELECT * FROM transcripts').all() as Record<string, unknown>[]
      expect(rows).toHaveLength(1)
      expect(rows[0]!['title']).toBe('Updated Title')
      expect(rows[0]!['message_count']).toBe(100)
      expect(rows[0]!['tool_event_count']).toBe(20)
      expect(rows[0]!['branch']).toBe('feature-x')
    } finally {
      db.close()
    }
  })

  it('creates table with 18 columns', () => {
    upsertSearchIndex(dbPath, makeManifest())

    const db = new Database(dbPath, { readonly: true })
    try {
      const info = db.prepare('PRAGMA table_info(transcripts)').all() as Record<string, unknown>[]
      expect(info).toHaveLength(23)
      const columnNames = info.map((r) => r['name'])
      expect(columnNames).toEqual([
        'client', 'project', 'session_id', 'raw_sha256',
        'title', 'started_at', 'imported_at',
        'cwd', 'branch', 'raw_source_path', 'raw_upload_permission',
        'global_raw_path', 'global_clean_path', 'global_manifest_path',
        'repo_raw_path', 'repo_clean_path', 'repo_manifest_path',
        'message_count', 'tool_event_count',
        'cleaning_mode', 'repo_mirror_enabled',
        'content', 'commit_layer',
      ])
    } finally {
      db.close()
    }
  })

  it('inserts multiple different records', () => {
    upsertSearchIndex(dbPath, makeManifest({ session_id: 'sess-001', raw_sha256: 'hash1' }))
    upsertSearchIndex(dbPath, makeManifest({ session_id: 'sess-002', raw_sha256: 'hash2', title: 'Second' }))
    upsertSearchIndex(dbPath, makeManifest({ session_id: 'sess-003', raw_sha256: 'hash3', client: 'codex' }))

    const db = new Database(dbPath, { readonly: true })
    try {
      const rows = db.prepare('SELECT session_id FROM transcripts ORDER BY session_id').all() as Record<string, unknown>[]
      expect(rows).toHaveLength(3)
      expect(rows[0]!['session_id']).toBe('sess-001')
      expect(rows[1]!['session_id']).toBe('sess-002')
      expect(rows[2]!['session_id']).toBe('sess-003')
    } finally {
      db.close()
    }
  })

  it('opens an existing db and preserves previous records', () => {
    upsertSearchIndex(dbPath, makeManifest({ session_id: 'first' }))
    upsertSearchIndex(dbPath, makeManifest({ session_id: 'second', raw_sha256: 'different' }))

    const db = new Database(dbPath, { readonly: true })
    try {
      const count = (db.prepare('SELECT COUNT(*) as cnt FROM transcripts').get() as { cnt: number }).cnt
      expect(count).toBe(2)
    } finally {
      db.close()
    }
  })

  it('enforces composite primary key (client, project, session_id, raw_sha256)', () => {
    upsertSearchIndex(dbPath, makeManifest({ raw_sha256: 'sha-aaa', title: 'First' }))
    upsertSearchIndex(dbPath, makeManifest({ raw_sha256: 'sha-bbb', title: 'Second' }))

    const db = new Database(dbPath, { readonly: true })
    try {
      const rows = db.prepare('SELECT title FROM transcripts ORDER BY raw_sha256').all() as Record<string, unknown>[]
      expect(rows).toHaveLength(2)
      expect(rows[0]!['title']).toBe('First')
      expect(rows[1]!['title']).toBe('Second')
    } finally {
      db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// searchTranscripts — FTS4 full-text search
// ---------------------------------------------------------------------------

describe('searchTranscripts', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'db-fts-test-'))
    dbPath = join(tmpDir, 'search.sqlite')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array when db does not exist', () => {
    const results = searchTranscripts(dbPath, 'anything')
    expect(results).toEqual([])
  })

  it('finds records matching query term in title', () => {
    upsertSearchIndex(dbPath, makeManifest({ title: 'authentication bug', session_id: 'sess-auth' }))
    upsertSearchIndex(dbPath, makeManifest({ title: 'unrelated session', session_id: 'sess-other', raw_sha256: 'other' }))

    const results = searchTranscripts(dbPath, 'authentication')
    expect(results).toHaveLength(1)
    expect(results[0]!.session_id).toBe('sess-auth')
  })

  it('finds records matching query term in cwd', () => {
    upsertSearchIndex(dbPath, makeManifest({ cwd: '/home/user/myproject', session_id: 'sess-cwd' }))
    const results = searchTranscripts(dbPath, 'myproject')
    expect(results).toHaveLength(1)
    expect(results[0]!.session_id).toBe('sess-cwd')
  })

  it('returns empty array when no records match', () => {
    upsertSearchIndex(dbPath, makeManifest({ title: 'hello world' }))
    const results = searchTranscripts(dbPath, 'zzznomatch9999')
    expect(results).toEqual([])
  })

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      upsertSearchIndex(dbPath, makeManifest({
        session_id: `sess-${i}`,
        raw_sha256: `hash-${i}`,
        title: 'common keyword session',
      }))
    }
    const results = searchTranscripts(dbPath, 'common', 3)
    expect(results.length).toBe(3)
  })

  it('result records have required SearchResult fields', () => {
    upsertSearchIndex(dbPath, makeManifest({
      title: 'feature implementation',
      cwd: '/home/dev',
      branch: 'feature/auth',
      started_at: '2024-07-01T00:00:00Z',
    }))
    const results = searchTranscripts(dbPath, 'feature')
    expect(results).toHaveLength(1)
    const r = results[0]!
    expect(r.client).toBe('claude')
    expect(r.project).toBe('my-project')
    expect(r.title).toBe('feature implementation')
    expect(r.cwd).toBe('/home/dev')
    expect(r.branch).toBe('feature/auth')
    expect(r.started_at).toBe('2024-07-01T00:00:00Z')
    expect(Object.keys(r)).toEqual(['client', 'project', 'session_id', 'title', 'cwd', 'branch', 'started_at'])
  })

  it('returns empty array when sanitized query is empty (only special chars)', () => {
    upsertSearchIndex(dbPath, makeManifest({ title: 'hello world' }))
    const results = searchTranscripts(dbPath, '"*()-')
    expect(results).toEqual([])
  })

  it('does not throw on multi-word query', () => {
    upsertSearchIndex(dbPath, makeManifest({ title: 'authentication bug fix', session_id: 'sess-multi' }))
    const results = searchTranscripts(dbPath, 'authentication bug')
    expect(results).toHaveLength(1)
    expect(results[0]!.session_id).toBe('sess-multi')
  })
})

// ---------------------------------------------------------------------------
// sanitizeFtsQuery
// ---------------------------------------------------------------------------

describe('sanitizeFtsQuery', () => {
  it('passes through plain words unchanged', () => {
    expect(sanitizeFtsQuery('hello world')).toBe('hello world')
  })

  it('strips FTS4 metacharacters', () => {
    expect(sanitizeFtsQuery('"auth* (bug)-')).toBe('auth bug')
  })

  it('strips single quotes to prevent FTS4 MATCH parse errors', () => {
    expect(sanitizeFtsQuery("it's broken")).toBe('it s broken')
    expect(sanitizeFtsQuery("O'Brien")).toBe('O Brien')
  })

  it('collapses whitespace runs', () => {
    expect(sanitizeFtsQuery('foo   bar')).toBe('foo bar')
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeFtsQuery('  hello  ')).toBe('hello')
  })

  it('returns empty string when only metacharacters given', () => {
    expect(sanitizeFtsQuery('"*()-^')).toBe('')
  })

  it('preserves Unicode letters', () => {
    expect(sanitizeFtsQuery('café authentication')).toBe('café authentication')
  })
})

// ---------------------------------------------------------------------------
// initSchema + rebuildFtsIndex
// ---------------------------------------------------------------------------

describe('initSchema', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'db-schema-test-'))
    dbPath = join(tmpDir, 'schema.sqlite')
  })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('creates transcripts table and FTS table without inserting data', () => {
    initSchema(dbPath)
    expect(existsSync(dbPath)).toBe(true)
    const db = new Database(dbPath, { readonly: true })
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' OR type='shadow'").all() as { name: string }[]
      const names = tables.map(t => t.name)
      expect(names).toContain('transcripts')
      expect(names).toContain('transcripts_fts')
    } finally {
      db.close()
    }
  })

  it('is idempotent — calling twice does not throw', () => {
    expect(() => { initSchema(dbPath); initSchema(dbPath) }).not.toThrow()
  })
})

describe('rebuildFtsIndex', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'db-rebuild-test-'))
    dbPath = join(tmpDir, 'rebuild.sqlite')
  })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('makes records searchable after upsert without per-row rebuild', () => {
    // upsertSearchIndex still rebuilds per-row by default, so test the
    // explicit rebuildFtsIndex path by using initSchema + raw insert
    initSchema(dbPath)
    const db = new Database(dbPath)
    try {
      db.prepare(`INSERT INTO transcripts (${['client','project','session_id','raw_sha256','title','started_at','imported_at','cwd','branch','raw_source_path','raw_upload_permission','global_raw_path','global_clean_path','global_manifest_path','repo_raw_path','repo_clean_path','repo_manifest_path','message_count','tool_event_count','cleaning_mode','repo_mirror_enabled','content','commit_layer'].join(',')}) VALUES (${Array(23).fill('?').join(',')})`)
        .run('claude','proj','s1','h1','rebuild test','2024-01-01T00:00:00Z','2024-01-01T00:00:00Z','/cwd','main','/raw','none','/graw','/gclean','','/rraw','/rclean','/rmanifest',1,0,'','','','')
    } finally {
      db.close()
    }
    // Before rebuild, search returns nothing
    expect(searchTranscripts(dbPath, 'rebuild')).toEqual([])
    // After rebuild, search finds the row
    rebuildFtsIndex(dbPath)
    const results = searchTranscripts(dbPath, 'rebuild')
    expect(results).toHaveLength(1)
    expect(results[0]!.session_id).toBe('s1')
  })
})

// ---------------------------------------------------------------------------
// searchTranscripts — error resilience
// ---------------------------------------------------------------------------

describe('searchTranscripts error resilience', () => {
  let tmpDir: string
  let dbPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'db-err-test-'))
    dbPath = join(tmpDir, 'err.sqlite')
  })
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('returns empty array when FTS table is missing (legacy DB with only transcripts table)', () => {
    // Create DB with transcripts table but no FTS table
    const db = new Database(dbPath)
    db.exec(`CREATE TABLE transcripts (
      client TEXT, project TEXT, session_id TEXT, raw_sha256 TEXT,
      title TEXT, started_at TEXT, imported_at TEXT, cwd TEXT, branch TEXT,
      raw_source_path TEXT, raw_upload_permission TEXT, global_raw_path TEXT,
      global_clean_path TEXT, repo_raw_path TEXT, repo_clean_path TEXT,
      repo_manifest_path TEXT, message_count INTEGER, tool_event_count INTEGER,
      PRIMARY KEY (client, project, session_id, raw_sha256)
    )`)
    db.close()
    // searchTranscripts should not throw — returns empty
    expect(searchTranscripts(dbPath, 'anything')).toEqual([])
  })
})
