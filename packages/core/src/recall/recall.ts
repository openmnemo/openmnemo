/**
 * Recall — on-demand transcript sync + latest session lookup.
 * Port of scripts/recall-session.py
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import Database from 'better-sqlite3'

import { slugify } from '../transcript/common.js'
import { defaultGlobalTranscriptRoot, discoverSourceFiles, transcriptMatchesRepo } from '../transcript/discover.js'
import { importTranscript, transcriptHasContent } from '../transcript/import.js'
import { parseTranscript } from '../transcript/parse.js'
import { searchTranscriptsByColumns, sanitizeFtsQuery } from '../transcript/db.js'
import type { SearchResult } from '../transcript/db.js'
import { createGraphAdapter } from '../storage/factory.js'
import type { GraphNode } from '../storage/graph/graph-adapter.js'
import { toPosixPath } from '../utils/path.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecallResult {
  found: boolean
  project: string
  repo: string
  imported_count: number
  message?: string
  client?: string
  session_id?: string
  title?: string
  started_at?: string
  cwd?: string
  branch?: string
  message_count?: number
  tool_event_count?: number
  global_clean_path?: string
  clean_content?: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function recall(
  root: string,
  projectName: string,
  globalRootOverride: string,
  activationTime: string,
): Promise<RecallResult> {
  const resolvedRoot = resolve(root)
  const repoSlug = slugify(projectName.trim() || (resolvedRoot.split(/[/\\]/).pop() ?? ''), 'project')
  const globalRoot = globalRootOverride ? resolve(globalRootOverride) : defaultGlobalTranscriptRoot()
  const effectiveActivation = activationTime || nowIso()

  const imported = await syncCurrentProject(resolvedRoot, repoSlug, globalRoot)

  const session = findLatestSession(globalRoot, resolvedRoot, repoSlug, effectiveActivation)

  if (session === null) {
    return {
      found: false,
      project: repoSlug,
      repo: toPosixPath(resolvedRoot),
      imported_count: imported,
      message: 'No previous session found for this project.',
    }
  }

  const cleanPath = String(session['global_clean_path'] ?? '')
  let cleanContent = ''
  if (cleanPath && existsSync(cleanPath)) {
    try {
      cleanContent = readFileSync(cleanPath, 'utf-8')
    } catch {
      // ignore read errors
    }
  }

  return {
    found: true,
    project: repoSlug,
    repo: toPosixPath(resolvedRoot),
    imported_count: imported,
    client: String(session['client'] ?? ''),
    session_id: String(session['session_id'] ?? ''),
    title: String(session['title'] ?? ''),
    started_at: String(session['started_at'] ?? ''),
    cwd: String(session['cwd'] ?? ''),
    branch: String(session['branch'] ?? ''),
    message_count: Number(session['message_count'] ?? 0),
    tool_event_count: Number(session['tool_event_count'] ?? 0),
    global_clean_path: cleanPath,
    clean_content: cleanContent,
  }
}

// ---------------------------------------------------------------------------
// Sync current project
// ---------------------------------------------------------------------------

export async function syncCurrentProject(root: string, repoSlug: string, globalRoot: string): Promise<number> {
  const discovered = discoverSourceFiles()
  let imported = 0

  for (const [client, source] of discovered) {
    let parsed
    try {
      parsed = parseTranscript(client, source)
    } catch {
      continue
    }

    if (!transcriptHasContent(parsed)) continue
    if (!transcriptMatchesRepo(parsed, root, repoSlug)) continue

    try {
      await importTranscript(parsed, root, globalRoot, repoSlug, 'not-set', true)
      imported++
    } catch {
      continue
    }
  }

  return imported
}

// ---------------------------------------------------------------------------
// Find latest session
// ---------------------------------------------------------------------------

export function findLatestSession(
  globalRoot: string,
  root: string,
  repoSlug: string,
  activationTime: string,
): Record<string, unknown> | null {
  const dbPath = join(globalRoot, 'index', 'search.sqlite')
  if (!existsSync(dbPath)) {
    return findLatestFromJsonl(globalRoot, root, repoSlug, activationTime)
  }

  try {
    const db = new Database(dbPath, { readonly: true })
    try {
      const rows = db
        .prepare('SELECT * FROM transcripts WHERE started_at < ? ORDER BY started_at DESC LIMIT 20')
        .all(activationTime) as Record<string, unknown>[]

      const resolvedRoot = toPosixPath(resolve(root)).toLowerCase()
      for (const row of rows) {
        const cwd = String(row['cwd'] ?? '')
        const project = String(row['project'] ?? '')
        if (cwdMatches(cwd, resolvedRoot) || project === repoSlug) {
          return row
        }
      }
    } finally {
      db.close()
    }
  } catch {
    return findLatestFromJsonl(globalRoot, root, repoSlug, activationTime)
  }

  // No matching row in DB — fall back to JSONL index
  return findLatestFromJsonl(globalRoot, root, repoSlug, activationTime)
}

// ---------------------------------------------------------------------------
// JSONL fallback
// ---------------------------------------------------------------------------

export function findLatestFromJsonl(
  globalRoot: string,
  root: string,
  repoSlug: string,
  activationTime: string,
): Record<string, unknown> | null {
  const jsonlPath = join(globalRoot, 'index', 'sessions.jsonl')
  if (!existsSync(jsonlPath)) return null

  const resolvedRoot = toPosixPath(resolve(root)).toLowerCase()
  const candidates: Record<string, unknown>[] = []

  let content: string
  try {
    content = readFileSync(jsonlPath, 'utf-8')
  } catch {
    return null
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      continue
    }

    const started = String(entry['started_at'] ?? '')
    if (started >= activationTime) continue

    const cwd = String(entry['cwd'] ?? '')
    const project = String(entry['project'] ?? '')
    if (cwdMatches(cwd, resolvedRoot) || project === repoSlug) {
      candidates.push(entry)
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const aTime = String(a['started_at'] ?? '')
    const bTime = String(b['started_at'] ?? '')
    return bTime.localeCompare(aTime)
  })
  return candidates[0]!
}

// ---------------------------------------------------------------------------
// CWD matching
// ---------------------------------------------------------------------------

export function cwdMatches(cwd: string, resolvedRoot: string): boolean {
  if (!cwd) return false
  try {
    const cwdResolved = toPosixPath(resolve(cwd)).toLowerCase()
    if (cwdResolved === resolvedRoot) return true
    const prefix = resolvedRoot.endsWith('/') ? resolvedRoot : resolvedRoot + '/'
    return cwdResolved.startsWith(prefix)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function formatText(payload: RecallResult): string {
  if (!payload.found) {
    return [
      `project: ${payload.project}`,
      `imported: ${payload.imported_count}`,
      `result: ${payload.message ?? 'No previous session found.'}`,
    ].join('\n')
  }

  const lines = [
    `project: ${payload.project}`,
    `client: ${payload.client ?? ''}`,
    `session_id: ${payload.session_id ?? ''}`,
    `title: ${payload.title ?? ''}`,
    `started_at: ${payload.started_at ?? ''}`,
    `cwd: ${payload.cwd ?? ''}`,
    `branch: ${payload.branch ?? ''}`,
    `messages: ${payload.message_count ?? 0}`,
    `tool_events: ${payload.tool_event_count ?? 0}`,
    `imported_this_sync: ${payload.imported_count}`,
    `clean_transcript: ${payload.global_clean_path ?? ''}`,
  ]

  if (payload.clean_content) {
    lines.push('', '--- clean transcript content ---', payload.clean_content)
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Layered full-text search
// ---------------------------------------------------------------------------

export interface SearchRecallResult {
  mode: 'mixed'
  source_counts: {
    fts: number
    vector: number
    graph: number
  }
  results: SearchResult[]
}

/**
 * Session-level mixed retrieval over the transcript index.
 * Phase 0 fuses:
 *   - FTS recall (commit/meta/content)
 *   - deterministic local vector recall over session text
 *   - graph recall from entity/session links when graph data exists
 *
 * Results are merged with Reciprocal Rank Fusion (RRF) and returned as
 * session-level SearchResult rows. In Phase 1.6+, the vector / graph inputs
 * can move from transcript/session scope to memory-unit scope without changing
 * the public search contract here.
 */
export function searchRecall(
  globalRoot: string,
  query: string,
  limit = 20,
): SearchRecallResult {
  const dbPath = join(globalRoot, 'index', 'search.sqlite')
  const effectiveLimit = limit > 0 ? limit : Number.MAX_SAFE_INTEGER
  const rows = loadSessionRows(dbPath)
  const fts = searchFtsRecall(dbPath, query, effectiveLimit)
  const vector = searchVectorRecall(rows, query, effectiveLimit)
  const graph = searchGraphRecall(dirname(dbPath), rows, query, effectiveLimit)

  return {
    mode: 'mixed',
    source_counts: {
      fts: fts.length,
      vector: vector.length,
      graph: graph.length,
    },
    results: fuseRankedResults([fts, vector, graph], effectiveLimit),
  }
}

// ---------------------------------------------------------------------------
// Mixed retrieval helpers
// ---------------------------------------------------------------------------

const RRF_K = 60
const DEFAULT_VECTOR_DIMS = 1536
const GRAPH_LABELS = [
  'Project',
  'Technology',
  'Concept',
  'Person',
  'Commit',
  'Session',
  'SourceAsset',
  'ArchiveAnchor',
  'MemoryUnit',
] as const

interface SessionSearchRow extends SearchResult {
  raw_sha256: string
  content: string
  commit_layer: string
}

function compareSearchResults(left: SearchResult, right: SearchResult): number {
  return right.started_at.localeCompare(left.started_at)
    || left.project.localeCompare(right.project)
    || left.session_id.localeCompare(right.session_id)
}

function sessionKey(result: Pick<SearchResult, 'client' | 'project' | 'session_id'>): string {
  return [result.client, result.project, result.session_id].join('\u0000')
}

function toSearchResult(row: SessionSearchRow): SearchResult {
  return {
    client: row.client,
    project: row.project,
    session_id: row.session_id,
    title: row.title,
    cwd: row.cwd,
    branch: row.branch,
    started_at: row.started_at,
  }
}

function normalizeSearchResults(results: SearchResult[], limit: number): SearchResult[] {
  const deduped = new Map<string, SearchResult>()
  for (const result of results) {
    const key = sessionKey(result)
    if (!deduped.has(key)) deduped.set(key, result)
  }
  return [...deduped.values()].slice(0, limit)
}

function fuseRankedResults(
  rankedLists: SearchResult[][],
  limit: number,
): SearchResult[] {
  const scores = new Map<string, { result: SearchResult, score: number }>()

  for (const list of rankedLists) {
    list.forEach((result, index) => {
      const key = sessionKey(result)
      const entry = scores.get(key)
      const rrf = 1 / (RRF_K + index + 1)
      if (entry) {
        entry.score += rrf
      } else {
        scores.set(key, { result, score: rrf })
      }
    })
  }

  return [...scores.values()]
    .sort((left, right) =>
      right.score - left.score
      || compareSearchResults(left.result, right.result))
    .slice(0, limit)
    .map((entry) => entry.result)
}

function searchFtsRecall(dbPath: string, query: string, limit: number): SearchResult[] {
  const commit = searchTranscriptsByColumns(dbPath, query, ['commit_layer'], limit)
  const meta = searchTranscriptsByColumns(dbPath, query, ['title', 'cwd', 'branch'], limit)
  const content = searchTranscriptsByColumns(dbPath, query, ['content'], limit)
  return fuseRankedResults([commit, meta, content], limit)
}

function loadSessionRows(dbPath: string): SessionSearchRow[] {
  if (!existsSync(dbPath)) return []

  const db = new Database(dbPath, { readonly: true })
  try {
    const rows = db.prepare(`
      SELECT
        client,
        project,
        session_id,
        raw_sha256,
        title,
        cwd,
        branch,
        started_at,
        content,
        commit_layer
      FROM transcripts
      ORDER BY started_at DESC
    `).all() as SessionSearchRow[]

    const deduped = new Map<string, SessionSearchRow>()
    for (const row of rows) {
      const key = sessionKey(row)
      if (!deduped.has(key)) deduped.set(key, row)
    }
    return [...deduped.values()]
  } catch {
    return []
  } finally {
    db.close()
  }
}

function hashToken(token: string): number {
  let hash = 2166136261
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function deterministicTextEmbedding(text: string, dimensions = DEFAULT_VECTOR_DIMS): number[] {
  const sanitized = sanitizeFtsQuery(text).toLowerCase()
  const tokens = sanitized ? sanitized.split(/\s+/).filter(Boolean) : []
  if (tokens.length === 0) return Array(dimensions).fill(0)

  const vector = Array(dimensions).fill(0)
  for (const token of tokens) {
    const hash = hashToken(token)
    const index = hash % dimensions
    const sign = (hash & 1) === 0 ? 1 : -1
    vector[index] += sign
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm === 0) return vector
  return vector.map((value) => value / norm)
}

function cosineSimilarity(left: number[], right: number[]): number {
  let score = 0
  for (let index = 0; index < left.length; index++) {
    score += left[index]! * right[index]!
  }
  return score
}

function isZeroVector(vector: number[]): boolean {
  return vector.every((value) => value === 0)
}

function searchVectorRecall(rows: SessionSearchRow[], query: string, limit: number): SearchResult[] {
  if (limit <= 0 || rows.length === 0) return []

  const queryEmbedding = deterministicTextEmbedding(query)
  if (isZeroVector(queryEmbedding)) return []

  return rows
    .map((row) => {
      const body = [row.title, row.content, row.branch, row.cwd, row.commit_layer]
        .filter(Boolean)
        .join('\n')
      return {
        result: toSearchResult(row),
        score: cosineSimilarity(queryEmbedding, deterministicTextEmbedding(body)),
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || compareSearchResults(left.result, right.result))
    .slice(0, limit)
    .map((entry) => entry.result)
}

function extractGraphQueries(query: string): string[] {
  const sanitized = sanitizeFtsQuery(query)
  if (!sanitized) return []

  const unique = new Set<string>()
  unique.add(sanitized)
  for (const token of sanitized.split(/\s+/)) {
    const trimmed = token.trim()
    if (trimmed.length >= 3) unique.add(trimmed)
  }

  return [...unique].sort((left, right) => right.length - left.length).slice(0, 6)
}

function searchGraphRecall(
  indexDir: string,
  rows: SessionSearchRow[],
  query: string,
  limit: number,
): SearchResult[] {
  if (limit <= 0 || rows.length === 0) return []

  const rowsBySession = new Map(rows.map((row) => [sessionKey(row), row]))
  const rowsBySessionId = new Map<string, SessionSearchRow[]>()
  for (const row of rows) {
    const current = rowsBySessionId.get(row.session_id) ?? []
    current.push(row)
    rowsBySessionId.set(row.session_id, current)
  }

  const graph = createGraphAdapter({ indexDir })
  try {
    const results: SearchResult[] = []
    for (const graphQuery of extractGraphQueries(query)) {
      for (const label of GRAPH_LABELS) {
        const sessions = graph.findSessionsByEntity({
          entityName: graphQuery,
          entityLabel: label,
          depth: 2,
          limit,
        })
        for (const session of sessions) {
          const resolved = resolveGraphSession(session, rowsBySession, rowsBySessionId)
          if (resolved) results.push(resolved)
        }
      }
    }
    return normalizeSearchResults(results, limit)
  } finally {
    graph.close()
  }
}

function resolveGraphSession(
  sessionNode: GraphNode,
  rowsBySession: Map<string, SessionSearchRow>,
  rowsBySessionId: Map<string, SessionSearchRow[]>,
): SearchResult | null {
  const client = typeof sessionNode.properties.client === 'string' ? sessionNode.properties.client : ''
  const project = typeof sessionNode.properties.project === 'string' ? sessionNode.properties.project : ''
  const sessionId = typeof sessionNode.properties.session_id === 'string' ? sessionNode.properties.session_id : ''

  if (client && project && sessionId) {
    const exact = rowsBySession.get(sessionKey({ client, project, session_id: sessionId }))
    if (exact) return toSearchResult(exact)
  }

  if (sessionId) {
    const candidates = rowsBySessionId.get(sessionId)
    if (candidates && candidates.length > 0) return toSearchResult(candidates[0]!)
  }

  return null
}
