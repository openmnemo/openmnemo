import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { ManifestEntry } from '@openmnemo/types'

import {
  cwdMatches,
  findLatestFromJsonl,
  formatText,
  searchRecall,
  type RecallResult,
} from '../../src/recall/recall.js'
import { upsertSearchIndex } from '../../src/transcript/db.js'
import { createGraphAdapter } from '../../src/storage/factory.js'
import { toPosixPath } from '../../src/utils/path.js'

function buildManifest(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  const sessionId = overrides.session_id ?? 'sess-001'
  const rawSha = overrides.raw_sha256 ?? `${sessionId}-sha`
  return {
    client: 'claude',
    project: 'openmnemo',
    session_id: sessionId,
    raw_sha256: rawSha,
    title: 'Session title',
    started_at: '2024-06-01T10:00:00Z',
    imported_at: '2024-06-01T10:05:00Z',
    cwd: '/workspace/openmnemo',
    branch: 'main',
    raw_source_path: `/tmp/${sessionId}.jsonl`,
    raw_upload_permission: 'not-set',
    global_raw_path: `/tmp/${sessionId}.jsonl`,
    global_clean_path: `/tmp/${sessionId}.md`,
    global_manifest_path: `/tmp/${sessionId}.manifest.json`,
    repo_raw_path: `Memory/06_transcripts/raw/${sessionId}.jsonl`,
    repo_clean_path: `Memory/06_transcripts/clean/${sessionId}.md`,
    repo_manifest_path: `Memory/06_transcripts/manifests/${sessionId}.json`,
    message_count: 4,
    tool_event_count: 1,
    cleaning_mode: 'full',
    repo_mirror_enabled: false,
    content: '',
    commit_layer: '',
    ...overrides,
  }
}

function insertTranscript(globalRoot: string, overrides: Partial<ManifestEntry>): void {
  upsertSearchIndex(join(globalRoot, 'index', 'search.sqlite'), buildManifest(overrides))
}

// ---------------------------------------------------------------------------
// cwdMatches
// ---------------------------------------------------------------------------

describe('cwdMatches', () => {
  it('returns true for exact match', () => {
    const root = toPosixPath(resolve('/projects/my-app')).toLowerCase()
    expect(cwdMatches('/projects/my-app', root)).toBe(true)
  })

  it('returns true for subdirectory match', () => {
    const root = toPosixPath(resolve('/projects/my-app')).toLowerCase()
    expect(cwdMatches('/projects/my-app/src/utils', root)).toBe(true)
  })

  it('returns false when cwd does not match', () => {
    const root = toPosixPath(resolve('/projects/my-app')).toLowerCase()
    expect(cwdMatches('/other/project', root)).toBe(false)
  })

  it('returns false for empty cwd', () => {
    const root = toPosixPath(resolve('/projects/my-app')).toLowerCase()
    expect(cwdMatches('', root)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// findLatestFromJsonl
// ---------------------------------------------------------------------------

describe('findLatestFromJsonl', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'recall-jsonl-'))
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('finds the latest session matching the project slug', () => {
    const indexDir = join(tmpDir, 'index')
    mkdirSync(indexDir, { recursive: true })

    const sessions = [
      { project: 'my-app', started_at: '2024-01-01T10:00:00Z', session_id: 'older' },
      { project: 'my-app', started_at: '2024-06-15T10:00:00Z', session_id: 'newer' },
    ]
    writeFileSync(
      join(indexDir, 'sessions.jsonl'),
      sessions.map(s => JSON.stringify(s)).join('\n') + '\n',
    )

    const result = findLatestFromJsonl(tmpDir, '/some/path', 'my-app', '2025-01-01T00:00:00Z')
    expect(result).not.toBeNull()
    expect(result!['session_id']).toBe('newer')
  })

  it('filters out sessions at or after activation time', () => {
    const indexDir = join(tmpDir, 'index')
    mkdirSync(indexDir, { recursive: true })

    const sessions = [
      { project: 'my-app', started_at: '2024-01-01T10:00:00Z', session_id: 'before' },
      { project: 'my-app', started_at: '2025-06-01T00:00:00Z', session_id: 'after' },
    ]
    writeFileSync(
      join(indexDir, 'sessions.jsonl'),
      sessions.map(s => JSON.stringify(s)).join('\n') + '\n',
    )

    const result = findLatestFromJsonl(tmpDir, '/some/path', 'my-app', '2025-01-01T00:00:00Z')
    expect(result).not.toBeNull()
    expect(result!['session_id']).toBe('before')
  })

  it('returns null when no sessions match the project', () => {
    const indexDir = join(tmpDir, 'index')
    mkdirSync(indexDir, { recursive: true })

    const sessions = [
      { project: 'other-project', started_at: '2024-01-01T10:00:00Z', session_id: 's1' },
    ]
    writeFileSync(
      join(indexDir, 'sessions.jsonl'),
      sessions.map(s => JSON.stringify(s)).join('\n') + '\n',
    )

    const result = findLatestFromJsonl(tmpDir, '/some/path', 'my-app', '2025-01-01T00:00:00Z')
    expect(result).toBeNull()
  })

  it('returns null when sessions.jsonl does not exist', () => {
    const result = findLatestFromJsonl(tmpDir, '/some/path', 'my-app', '2025-01-01T00:00:00Z')
    expect(result).toBeNull()
  })

  it('matches sessions by cwd in addition to project slug', () => {
    const indexDir = join(tmpDir, 'index')
    mkdirSync(indexDir, { recursive: true })

    // Use a real temp path so resolve() works correctly
    const projectRoot = join(tmpDir, 'projects', 'my-app')
    mkdirSync(projectRoot, { recursive: true })
    const resolvedRoot = toPosixPath(resolve(projectRoot))

    const sessions = [
      { project: 'unrelated', cwd: resolvedRoot, started_at: '2024-01-01T10:00:00Z', session_id: 'cwd-match' },
    ]
    writeFileSync(
      join(indexDir, 'sessions.jsonl'),
      sessions.map(s => JSON.stringify(s)).join('\n') + '\n',
    )

    const result = findLatestFromJsonl(tmpDir, projectRoot, 'different-slug', '2025-01-01T00:00:00Z')
    expect(result).not.toBeNull()
    expect(result!['session_id']).toBe('cwd-match')
  })

  it('skips malformed JSON lines', () => {
    const indexDir = join(tmpDir, 'index')
    mkdirSync(indexDir, { recursive: true })

    const content = [
      'not valid json',
      JSON.stringify({ project: 'my-app', started_at: '2024-01-01T10:00:00Z', session_id: 'valid' }),
      '{ broken: }',
    ].join('\n') + '\n'
    writeFileSync(join(indexDir, 'sessions.jsonl'), content)

    const result = findLatestFromJsonl(tmpDir, '/some/path', 'my-app', '2025-01-01T00:00:00Z')
    expect(result).not.toBeNull()
    expect(result!['session_id']).toBe('valid')
  })
})

// ---------------------------------------------------------------------------
// formatText
// ---------------------------------------------------------------------------

describe('formatText', () => {
  it('formats a found result with session details', () => {
    const payload: RecallResult = {
      found: true,
      project: 'my-app',
      repo: '/projects/my-app',
      imported_count: 3,
      client: 'claude',
      session_id: 'abc-123',
      title: 'Test Session',
      started_at: '2024-06-15T10:00:00Z',
      cwd: '/projects/my-app',
      branch: 'main',
      message_count: 42,
      tool_event_count: 7,
      global_clean_path: '/tmp/clean.md',
    }

    const text = formatText(payload)
    expect(text).toContain('project: my-app')
    expect(text).toContain('client: claude')
    expect(text).toContain('session_id: abc-123')
    expect(text).toContain('title: Test Session')
    expect(text).toContain('started_at: 2024-06-15T10:00:00Z')
    expect(text).toContain('branch: main')
    expect(text).toContain('messages: 42')
    expect(text).toContain('tool_events: 7')
    expect(text).toContain('imported_this_sync: 3')
  })

  it('formats a not-found result with message', () => {
    const payload: RecallResult = {
      found: false,
      project: 'my-app',
      repo: '/projects/my-app',
      imported_count: 0,
      message: 'No previous session found for this project.',
    }

    const text = formatText(payload)
    expect(text).toContain('project: my-app')
    expect(text).toContain('imported: 0')
    expect(text).toContain('result: No previous session found for this project.')
  })

  it('includes clean content when present', () => {
    const payload: RecallResult = {
      found: true,
      project: 'my-app',
      repo: '/projects/my-app',
      imported_count: 0,
      clean_content: 'This is the transcript content.',
      global_clean_path: '/tmp/clean.md',
    }

    const text = formatText(payload)
    expect(text).toContain('--- clean transcript content ---')
    expect(text).toContain('This is the transcript content.')
  })
})

// ---------------------------------------------------------------------------
// searchRecall
// ---------------------------------------------------------------------------

describe('searchRecall', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'recall-search-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns mixed retrieval results with source counts and RRF fusion', () => {
    insertTranscript(tmpDir, {
      session_id: 'sess-graph',
      raw_sha256: 'sha-graph',
      title: 'Memory unit architecture',
      started_at: '2024-06-03T10:00:00Z',
      content: 'We discussed archive anchor boundaries and retrieval tools for the memory unit.',
      commit_layer: 'feat: archive anchor memory unit graph wiring',
    })
    insertTranscript(tmpDir, {
      session_id: 'sess-fts',
      raw_sha256: 'sha-fts',
      title: 'Archive anchor follow-up',
      started_at: '2024-06-02T10:00:00Z',
      content: 'Archive anchor review notes for session retrieval.',
      commit_layer: 'docs: archive anchor follow-up',
    })
    insertTranscript(tmpDir, {
      session_id: 'sess-other',
      raw_sha256: 'sha-other',
      title: 'Authentication bug',
      started_at: '2024-06-01T10:00:00Z',
      content: 'Login token issue and cookie handling.',
      commit_layer: 'fix: auth token cookie flow',
    })

    const graph = createGraphAdapter({ indexDir: join(tmpDir, 'index') })
    try {
      graph.upsertNode({
        id: 'concept:archive-anchor',
        labels: ['Concept'],
        properties: { name: 'archive anchor' },
      })
      graph.upsertNode({
        id: 'session:sess-graph',
        labels: ['Session'],
        properties: { client: 'claude', project: 'openmnemo', session_id: 'sess-graph' },
      })
      graph.upsertEdge({
        fromId: 'concept:archive-anchor',
        toId: 'session:sess-graph',
        type: 'CONTAINS',
      })
    } finally {
      graph.close()
    }

    const result = searchRecall(tmpDir, 'archive anchor', 5)

    expect(result.mode).toBe('mixed')
    expect(result.source_counts.fts).toBeGreaterThan(0)
    expect(result.source_counts.vector).toBeGreaterThan(0)
    expect(result.source_counts.graph).toBeGreaterThan(0)
    expect(result.results[0]?.session_id).toBe('sess-graph')
  })

  it('falls back cleanly when graph data is absent', () => {
    insertTranscript(tmpDir, {
      session_id: 'sess-memory',
      raw_sha256: 'sha-memory',
      title: 'Session retrieval design',
      started_at: '2024-06-02T10:00:00Z',
      content: 'Session retrieval design with memory unit staging and search closure.',
      commit_layer: 'feat: retrieval design',
    })
    insertTranscript(tmpDir, {
      session_id: 'sess-auth',
      raw_sha256: 'sha-auth',
      title: 'Authentication bug',
      started_at: '2024-06-01T10:00:00Z',
      content: 'Password reset and login bugfix notes.',
      commit_layer: 'fix: auth flow',
    })

    const result = searchRecall(tmpDir, 'memory unit retrieval', 5)

    expect(result.mode).toBe('mixed')
    expect(result.source_counts.graph).toBe(0)
    expect(result.source_counts.fts).toBeGreaterThan(0)
    expect(result.source_counts.vector).toBeGreaterThan(0)
    expect(result.results[0]?.session_id).toBe('sess-memory')
  })

  it('resolves sessions from unit-level graph nodes after graph upgrade', () => {
    insertTranscript(tmpDir, {
      session_id: 'sess-unit-graph',
      raw_sha256: 'sha-unit-graph',
      title: 'Design review',
      started_at: '2024-06-04T10:00:00Z',
      content: 'Authentication follow-up without retrieval keywords.',
      commit_layer: 'fix: login redirect edge case',
    })

    const graph = createGraphAdapter({ indexDir: join(tmpDir, 'index') })
    try {
      graph.upsertNode({
        id: 'session:claude:openmnemo:sess-unit-graph',
        labels: ['Session'],
        properties: {
          entity_kind: 'session',
          client: 'claude',
          project: 'openmnemo',
          session_id: 'sess-unit-graph',
          title: 'Design review',
        },
      })
      graph.upsertNode({
        id: 'memory_unit:claude:openmnemo:sess-unit-graph:001',
        labels: ['MemoryUnit', 'DocumentChunk'],
        properties: {
          entity_kind: 'memory unit',
          unit_type: 'document_chunk',
          unit_type_display: 'document chunk',
          title: 'Primary retrieval chunk',
          summary: 'Structured memory unit graph recall',
          source_ref: 'turn:1',
        },
      })
      graph.upsertEdge({
        fromId: 'session:claude:openmnemo:sess-unit-graph',
        toId: 'memory_unit:claude:openmnemo:sess-unit-graph:001',
        type: 'CONTAINS_UNIT',
      })
    } finally {
      graph.close()
    }

    const result = searchRecall(tmpDir, 'memory unit', 5)

    expect(result.source_counts.fts).toBe(0)
    expect(result.source_counts.vector).toBe(0)
    expect(result.source_counts.graph).toBeGreaterThan(0)
    expect(result.results[0]?.session_id).toBe('sess-unit-graph')
  })

  it('treats limit=0 as no limit', () => {
    insertTranscript(tmpDir, {
      session_id: 'sess-a',
      raw_sha256: 'sha-a',
      title: 'Archive anchor alpha',
      started_at: '2024-06-02T10:00:00Z',
      content: 'Archive anchor alpha notes.',
    })
    insertTranscript(tmpDir, {
      session_id: 'sess-b',
      raw_sha256: 'sha-b',
      title: 'Archive anchor beta',
      started_at: '2024-06-01T10:00:00Z',
      content: 'Archive anchor beta notes.',
    })

    const result = searchRecall(tmpDir, 'archive anchor', 0)

    expect(result.results).toHaveLength(2)
    expect(result.results.map((entry) => entry.session_id)).toEqual(['sess-a', 'sess-b'])
  })
})
