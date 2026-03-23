import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ManifestEntry, ParsedTranscript } from '@openmnemo/types'
import type { MemoryExtractionBundle } from '../../src/memory/extraction.js'

import {
  buildTranscriptExtractionBundle,
  createVectorAdapter,
  deterministicTextEmbedding,
  isZeroVector,
  MEMORY_UNIT_VECTOR_DIMS,
  MEMORY_UNIT_VECTOR_NAMESPACE,
  searchMemoryUnitVectors,
  syncMemoryUnitVectors,
} from '../../src/index.js'

function buildManifest(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    client: 'codex',
    project: 'openmnemo',
    session_id: 'sess-vector',
    raw_sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    title: 'Vector memory test',
    started_at: '2026-03-22T08:00:00Z',
    imported_at: '2026-03-22T08:10:00Z',
    cwd: '/workspace/openmnemo',
    branch: 'main',
    raw_source_path: '/tmp/raw.jsonl',
    raw_upload_permission: 'none',
    global_raw_path: '/tmp/global/raw.jsonl',
    global_clean_path: '/tmp/global/clean.md',
    global_manifest_path: '/tmp/global/manifest.json',
    global_extraction_path: '/tmp/global/extracted.memory.json',
    repo_raw_path: 'Memory/06_transcripts/raw/raw.jsonl',
    repo_clean_path: 'Memory/06_transcripts/clean/clean.md',
    repo_manifest_path: 'Memory/06_transcripts/manifests/manifest.json',
    repo_extraction_path: 'Memory/06_transcripts/extracted/extracted.memory.json',
    message_count: 3,
    tool_event_count: 0,
    cleaning_mode: 'deterministic-code',
    repo_mirror_enabled: true,
    ...overrides,
  }
}

function buildParsed(overrides: Partial<ParsedTranscript> = {}): ParsedTranscript {
  return {
    client: 'codex',
    session_id: 'sess-vector',
    title: 'Vector memory test',
    started_at: '2026-03-22T08:00:00Z',
    cwd: '/workspace/openmnemo',
    branch: 'main',
    messages: [
      { role: 'user', text: 'We need cookie redirect handling for login flows.', timestamp: '2026-03-22T08:00:00Z' },
      { role: 'assistant', text: 'Capture cookie redirect handling as a memory unit.', timestamp: '2026-03-22T08:00:05Z' },
      { role: 'user', text: 'Graph cleanup should preserve only the latest runtime nodes.', timestamp: '2026-03-22T08:01:00Z' },
    ],
    tool_events: [],
    source_path: '/tmp/raw.jsonl',
    ...overrides,
  }
}

describe('memory unit vectors', () => {
  it('keeps non-ASCII text searchable while rejecting zero-vector queries', () => {
    expect(isZeroVector(deterministicTextEmbedding('记忆单元 设计', 16))).toBe(false)
    expect(isZeroVector(deterministicTextEmbedding('!!! ???', 16))).toBe(true)
  })

  it('syncs unit vectors and searches them with scope filters', () => {
    const globalRoot = mkdtempSync(join(tmpdir(), 'memory-vector-search-'))
    const bundle = buildTranscriptExtractionBundle(
      buildParsed(),
      buildManifest(),
      '# Clean transcript\n\nCookie redirect handling stays searchable.',
    )

    const vector = createVectorAdapter({
      indexDir: join(globalRoot, 'index'),
      embedding_dims: MEMORY_UNIT_VECTOR_DIMS,
      vector_namespace: MEMORY_UNIT_VECTOR_NAMESPACE,
    })

    try {
      syncMemoryUnitVectors(vector, bundle)
    } finally {
      vector.close()
    }

    try {
      const hits = searchMemoryUnitVectors(globalRoot, {
        text: 'cookie redirect handling',
        limit: 5,
        scope: {
          project: 'openmnemo',
          session_id: 'sess-vector',
          partition: '2026-03',
          unit_types: ['document_chunk'],
        },
      })

      expect(hits.length).toBeGreaterThan(0)
      expect(hits[0]!.kind).toBe('memory_unit')
      expect(hits[0]!.source).toBe('vector')
      expect(hits[0]!.project).toBe('openmnemo')
      expect(hits[0]!.partition).toBe('2026-03')

      const wrongScope = searchMemoryUnitVectors(globalRoot, {
        text: 'cookie redirect handling',
        limit: 5,
        scope: {
          project: 'different-project',
        },
      })

      expect(wrongScope).toEqual([])
      expect(searchMemoryUnitVectors(globalRoot, '!!! ???')).toEqual([])
    } finally {
      rmSync(globalRoot, { recursive: true, force: true })
    }
  })

  it('supports non-ASCII unit retrieval for the deterministic baseline', () => {
    const globalRoot = mkdtempSync(join(tmpdir(), 'memory-vector-unicode-'))
    const bundle = buildTranscriptExtractionBundle(
      buildParsed({
        messages: [
          { role: 'user', text: '我们先定义记忆单元边界。', timestamp: '2026-03-22T08:00:00Z' },
          { role: 'assistant', text: '然后把向量检索升级到 unit 级别。', timestamp: '2026-03-22T08:00:05Z' },
        ],
      }),
      buildManifest({
        title: '中文向量测试',
      }),
      '# 中文 clean transcript',
    )

    const vector = createVectorAdapter({
      indexDir: join(globalRoot, 'index'),
      embedding_dims: MEMORY_UNIT_VECTOR_DIMS,
      vector_namespace: MEMORY_UNIT_VECTOR_NAMESPACE,
    })

    try {
      syncMemoryUnitVectors(vector, bundle)
    } finally {
      vector.close()
    }

    try {
      const hits = searchMemoryUnitVectors(globalRoot, {
        text: '记忆单元 边界',
        limit: 10,
        scope: {
          project: 'openmnemo',
          session_id: 'sess-vector',
        },
      })

      expect(hits.length).toBeGreaterThan(0)
      expect(hits.some((hit) => bundle.memory_units.some((unit) => unit.id === hit.id))).toBe(true)
    } finally {
      rmSync(globalRoot, { recursive: true, force: true })
    }
  })

  it('replaces stale vectors when the same session bundle is synced again', () => {
    const globalRoot = mkdtempSync(join(tmpdir(), 'memory-vector-resync-'))
    let firstBundle: MemoryExtractionBundle
    let secondBundle: MemoryExtractionBundle
    const vector = createVectorAdapter({
      indexDir: join(globalRoot, 'index'),
      embedding_dims: MEMORY_UNIT_VECTOR_DIMS,
      vector_namespace: MEMORY_UNIT_VECTOR_NAMESPACE,
    })

    try {
      firstBundle = buildTranscriptExtractionBundle(
        buildParsed({
          messages: [
            { role: 'user', text: 'Legacy alpha retrieval phrase.', timestamp: '2026-03-22T08:00:00Z' },
            { role: 'assistant', text: 'Alpha response.', timestamp: '2026-03-22T08:00:05Z' },
          ],
        }),
        buildManifest(),
        '# Alpha transcript',
      )
      syncMemoryUnitVectors(vector, firstBundle)

      secondBundle = buildTranscriptExtractionBundle(
        buildParsed({
          messages: [
            { role: 'user', text: 'Fresh beta retrieval phrase.', timestamp: '2026-03-22T08:00:00Z' },
            { role: 'assistant', text: 'Beta response.', timestamp: '2026-03-22T08:00:05Z' },
          ],
        }),
        buildManifest({
          raw_sha256: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        }),
        '# Beta transcript',
      )
      syncMemoryUnitVectors(vector, secondBundle)
    } finally {
      vector.close()
    }

    try {
      const stale = searchMemoryUnitVectors(globalRoot, 'legacy alpha retrieval phrase')
      const fresh = searchMemoryUnitVectors(globalRoot, 'fresh beta retrieval phrase')
      const firstIds = new Set(firstBundle.memory_units.map((unit) => unit.id))
      const secondIds = new Set(secondBundle.memory_units.map((unit) => unit.id))

      expect(stale.every((hit) => !firstIds.has(hit.id))).toBe(true)
      expect(fresh.some((hit) => secondIds.has(hit.id))).toBe(true)
      expect(fresh.every((hit) => hit.kind === 'memory_unit')).toBe(true)
    } finally {
      rmSync(globalRoot, { recursive: true, force: true })
    }
  })
})
