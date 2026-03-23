import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import type { ParsedTranscript } from '@openmnemo/types'
import { createLocalDataLayerAPI, importTranscript } from '../../src/index.js'

function buildParsedTranscript(
  sessionId: string,
  startedAt: string,
  messages: ParsedTranscript['messages'],
): ParsedTranscript {
  return {
    client: 'codex',
    session_id: sessionId,
    title: `Session ${sessionId}`,
    started_at: startedAt,
    cwd: '/workspace/openmnemo',
    branch: 'main',
    messages,
    tool_events: [],
    source_path: '',
  }
}

describe('createLocalDataLayerAPI', () => {
  let tmpDir: string
  let repoRoot: string
  let globalRoot: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'local-data-layer-'))
    repoRoot = join(tmpDir, 'repo')
    globalRoot = join(tmpDir, 'global')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('wires mixed search, session hydration, and entity graph over local transcript artifacts', async () => {
    const sourceFile = join(tmpDir, 'session-a.jsonl')
    writeFileSync(sourceFile, '{"type":"session"}\n', 'utf-8')

    await importTranscript(
      {
        ...buildParsedTranscript(
          'sess-local-a',
          '2026-03-23T10:00:00Z',
          [
            {
              role: 'user',
              text: 'Cookie redirect handling should stay searchable.',
              timestamp: '2026-03-23T10:00:00Z',
            },
            {
              role: 'assistant',
              text: 'Let us keep cookie redirect handling at the memory unit layer.',
              timestamp: '2026-03-23T10:00:05Z',
            },
          ],
        ),
        source_path: sourceFile,
      },
      repoRoot,
      globalRoot,
      'openmnemo',
      'not-set',
      false,
    )

    const api = createLocalDataLayerAPI({ globalRoot })
    const search = await api.search({
      text: 'cookie redirect handling',
      target: 'mixed',
      limit: 10,
    })

    expect(search.hits.length).toBeGreaterThan(0)
    expect(search.hits[0]?.ref.kind).toBe('memory_unit')
    expect(search.hits.some((hit) => hit.ref.kind === 'source_asset')).toBe(true)
    expect(search.hits.some((hit) => hit.ref.kind === 'archive_anchor')).toBe(true)
    expect(search.hits.some((hit) => hit.ref.kind === 'session')).toBe(false)
    expect(search.hits
      .filter((hit) => hit.ref.kind !== 'session')
      .every((hit) => hit.session?.session_id === 'sess-local-a')).toBe(true)

    const session = await api.getSession('sess-local-a')
    expect(session?.clean_content).toContain('Cookie redirect handling should stay searchable.')

    const commitContext = await api.getCommitContext('sess-local-a')
    expect(commitContext?.session_id).toBe('sess-local-a')
    expect(commitContext?.commit_refs).toEqual([])

    const graph = await api.getEntityGraph('cookie redirect handling')
    expect(graph.nodes.some((node) => node.labels.includes('MemoryUnit'))).toBe(true)
    expect(graph.nodes.some((node) => node.labels.includes('Session'))).toBe(true)
    expect(graph.edges.length).toBeGreaterThan(0)
  })

  it('supports direct structured searches and session pagination through the local runtime', async () => {
    const sourceA = join(tmpDir, 'session-b.jsonl')
    const sourceB = join(tmpDir, 'session-c.jsonl')
    writeFileSync(sourceA, '{"type":"session"}\n', 'utf-8')
    writeFileSync(sourceB, '{"type":"session"}\n', 'utf-8')

    await importTranscript(
      {
        ...buildParsedTranscript(
          'sess-local-b',
          '2026-03-23T09:00:00Z',
          [
            {
              role: 'user',
              text: 'Alpha anchor phrase should resolve through the archive anchor.',
              timestamp: '2026-03-23T09:00:00Z',
            },
            {
              role: 'assistant',
              text: 'Alpha anchor phrase stays in the source asset too.',
              timestamp: '2026-03-23T09:00:05Z',
            },
          ],
        ),
        source_path: sourceA,
      },
      repoRoot,
      globalRoot,
      'openmnemo',
      'not-set',
      false,
    )

    await importTranscript(
      {
        ...buildParsedTranscript(
          'sess-local-c',
          '2026-03-23T11:00:00Z',
          [
            {
              role: 'user',
              text: 'Beta pagination phrase.',
              timestamp: '2026-03-23T11:00:00Z',
            },
            {
              role: 'assistant',
              text: 'Beta pagination phrase should sort newest first.',
              timestamp: '2026-03-23T11:00:05Z',
            },
          ],
        ),
        source_path: sourceB,
      },
      repoRoot,
      globalRoot,
      'openmnemo',
      'not-set',
      false,
    )

    const api = createLocalDataLayerAPI({ globalRoot })

    const sourceAssetSearch = await api.search({
      text: 'alpha anchor phrase stays in the source asset',
      target: 'source_asset',
      limit: 10,
    })
    expect(sourceAssetSearch.hits[0]?.ref.kind).toBe('source_asset')
    expect(sourceAssetSearch.hits[0]?.source_asset?.id).toBeTruthy()
    expect(sourceAssetSearch.hits[0]?.session?.session_id).toBe('sess-local-b')

    const archiveAnchorSearch = await api.search({
      text: 'alpha anchor phrase should resolve',
      target: 'archive_anchor',
      limit: 10,
    })
    expect(archiveAnchorSearch.hits[0]?.ref.kind).toBe('archive_anchor')
    expect(archiveAnchorSearch.hits[0]?.archive_anchor?.id).toBeTruthy()
    expect(archiveAnchorSearch.hits[0]?.session?.session_id).toBe('sess-local-b')

    const firstPage = await api.listSessions({ limit: 1 })
    expect(firstPage.items).toHaveLength(1)
    expect(firstPage.items[0]?.session_id).toBe('sess-local-c')
    expect(firstPage.next_cursor).toBeTruthy()

    const secondPage = await api.listSessions({ limit: 1, cursor: firstPage.next_cursor })
    expect(secondPage.items).toHaveLength(1)
    expect(secondPage.items[0]?.session_id).toBe('sess-local-b')
  })
})
