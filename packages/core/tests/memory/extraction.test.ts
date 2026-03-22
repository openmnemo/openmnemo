import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ManifestEntry, ParsedTranscript } from '@openmnemo/types'

import {
  buildTranscriptExtractionBundle,
  buildTranscriptSourceAsset,
  isMemoryExtractionBundle,
} from '../../src/index.js'
import { syncExtractionBundleGraph } from '../../src/memory/extraction.js'
import { createGraphAdapter } from '../../src/storage/factory.js'

function buildManifest(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    client: 'codex',
    project: 'openmnemo',
    session_id: 'sess-123',
    raw_sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    title: 'Memory unit design',
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
    message_count: 4,
    tool_event_count: 1,
    cleaning_mode: 'deterministic-code',
    repo_mirror_enabled: true,
    ...overrides,
  }
}

function buildParsed(overrides: Partial<ParsedTranscript> = {}): ParsedTranscript {
  return {
    client: 'codex',
    session_id: 'sess-123',
    title: 'Memory unit design',
    started_at: '2026-03-22T08:00:00Z',
    cwd: '/workspace/openmnemo',
    branch: 'main',
    messages: [
      { role: 'user', text: 'We should define memory units first.', timestamp: '2026-03-22T08:00:00Z' },
      { role: 'assistant', text: 'Agreed, use memory_unit as the runtime primary object.', timestamp: '2026-03-22T08:00:05Z' },
      { role: 'user', text: 'Then we can move vector and graph from session to unit.', timestamp: '2026-03-22T08:01:00Z' },
      { role: 'assistant', text: 'Yes, start with a deterministic document_chunk baseline.', timestamp: '2026-03-22T08:01:10Z' },
    ],
    tool_events: [
      { summary: 'apply_patch updated memory scaffolding', timestamp: '2026-03-22T08:01:15Z' },
    ],
    source_path: '/tmp/raw.jsonl',
    ...overrides,
  }
}

describe('buildTranscriptSourceAsset', () => {
  it('builds a transcript-backed source asset from manifest metadata', () => {
    const sourceAsset = buildTranscriptSourceAsset(buildManifest(), '# Clean transcript')

    expect(sourceAsset.asset_kind).toBe('transcript')
    expect(sourceAsset.project).toBe('openmnemo')
    expect(sourceAsset.partition).toBe('2026-03')
    expect(sourceAsset.source_uri).toBe('/tmp/global/clean.md')
    expect(sourceAsset.import_ref).toBe('/tmp/global/manifest.json')
  })
})

describe('buildTranscriptExtractionBundle', () => {
  it('builds deterministic source, units, archive anchor, and structural graph output', () => {
    const bundle = buildTranscriptExtractionBundle(
      buildParsed(),
      buildManifest(),
      '# Clean transcript\n\nBody text',
    )

    expect(isMemoryExtractionBundle(bundle)).toBe(true)
    expect(bundle.source_asset.id).toContain('source_asset:codex:openmnemo:sess-123')
    expect(bundle.memory_units).toHaveLength(3)
    expect(bundle.memory_units.map((unit) => unit.unit_type)).toEqual([
      'document_chunk',
      'document_chunk',
      'document_chunk',
    ])
    expect(bundle.memory_units[0]!.source_ref).toBe('turn:1')
    expect(bundle.memory_units[1]!.source_ref).toBe('turn:2')
    expect(bundle.memory_units[2]!.source_ref).toBe('tools')
    expect(bundle.memory_units[0]!.related_unit_ids).toEqual([bundle.memory_units[1]!.id])
    expect(bundle.memory_units[1]!.related_unit_ids).toEqual([
      bundle.memory_units[0]!.id,
      bundle.memory_units[2]!.id,
    ])
    expect(bundle.archive_anchor.memory_unit_ids).toEqual(bundle.memory_units.map((unit) => unit.id))
    expect(bundle.graph.nodes.some((node) => node.labels.includes('Session'))).toBe(true)
    expect(bundle.graph.nodes.some((node) => node.labels.includes('ArchiveAnchor'))).toBe(true)
    expect(bundle.graph.edges.some((edge) => edge.type === 'CONTAINS_UNIT')).toBe(true)
    expect(bundle.graph.edges.some((edge) => edge.type === 'NEXT_UNIT')).toBe(true)
  })

  it('falls back to a single tools unit when the transcript has no user/assistant messages', () => {
    const bundle = buildTranscriptExtractionBundle(
      buildParsed({ messages: [], tool_events: [{ summary: 'read_file login.ts', timestamp: null }] }),
      buildManifest({ message_count: 0, tool_event_count: 1 }),
      '# Clean transcript\n\n## Tool Events',
    )

    expect(bundle.memory_units).toHaveLength(1)
    expect(bundle.memory_units[0]!.source_ref).toBe('tools')
    expect(bundle.memory_units[0]!.body).toContain('read_file login.ts')
  })

  it('upserts bundle graph data into the runtime graph store for unit-level session recall', () => {
    const bundle = buildTranscriptExtractionBundle(
      buildParsed(),
      buildManifest(),
      '# Clean transcript\n\nBody text',
    )

    const indexDir = mkdtempSync(join(tmpdir(), 'extraction-graph-'))
    const graph = createGraphAdapter({ indexDir })
    try {
      syncExtractionBundleGraph(graph, bundle)

      const sessions = graph.findSessionsByEntity({
        entityName: 'memory unit',
        entityLabel: 'MemoryUnit',
        depth: 1,
        limit: 10,
      })

      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.properties['session_id']).toBe('sess-123')

      const related = graph.findRelated('session:codex:openmnemo:sess-123', 1)
      expect(related.some((node) => node.labels.includes('MemoryUnit'))).toBe(true)
      expect(related.some((node) => node.labels.includes('ArchiveAnchor'))).toBe(true)
    } finally {
      graph.close()
      rmSync(indexDir, { recursive: true, force: true })
    }
  })

  it('replaces previously managed graph nodes when the same session is re-imported', () => {
    const indexDir = mkdtempSync(join(tmpdir(), 'extraction-graph-replace-'))
    const graph = createGraphAdapter({ indexDir })
    try {
      const firstBundle = buildTranscriptExtractionBundle(
        buildParsed(),
        buildManifest(),
        '# Clean transcript\n\nBody text',
      )
      syncExtractionBundleGraph(graph, firstBundle)

      const secondBundle = buildTranscriptExtractionBundle(
        buildParsed({
          messages: [
            { role: 'user', text: 'Beta-only retrieval phrase', timestamp: '2026-03-22T08:02:00Z' },
            { role: 'assistant', text: 'Updated follow-up response', timestamp: '2026-03-22T08:02:10Z' },
          ],
          tool_events: [],
        }),
        buildManifest({ raw_sha256: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' }),
        '# Updated clean transcript\n\nBody text',
      )
      syncExtractionBundleGraph(graph, secondBundle)

      const stale = graph.findSessionsByEntity({
        entityName: 'memory units first',
        entityLabel: 'MemoryUnit',
        depth: 1,
        limit: 10,
      })
      const fresh = graph.findSessionsByEntity({
        entityName: 'beta-only retrieval phrase',
        entityLabel: 'MemoryUnit',
        depth: 1,
        limit: 10,
      })

      expect(stale).toHaveLength(0)
      expect(fresh).toHaveLength(1)
      expect(fresh[0]!.properties['session_id']).toBe('sess-123')
    } finally {
      graph.close()
      rmSync(indexDir, { recursive: true, force: true })
    }
  })
})
