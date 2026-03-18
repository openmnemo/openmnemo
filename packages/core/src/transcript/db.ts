/**
 * Transcript search index — SQLite upsert for the global transcript catalog.
 *
 * Uses sql.js (WebAssembly SQLite) so the module works without a native
 * sqlite3 binding.  The WASM init is async; we cache the resulting factory
 * promise so it is only resolved once per process.
 *
 * Full-text search uses FTS4 (not FTS5) because the default sql.js WASM build
 * includes FTS4 but not FTS5.  The `simple` tokenizer is used (FTS4 default);
 * `unicode61` is a FTS5-only extension and is not available here.
 */

import initSqlJs, { type SqlJsStatic } from 'sql.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { ManifestEntry } from '@openmnemo/types'

// ---------------------------------------------------------------------------
// Lazy sql.js initialisation (cached promise)
// ---------------------------------------------------------------------------

let sqlPromise: Promise<SqlJsStatic> | null = null

function getSqlJs(): Promise<SqlJsStatic> {
  if (sqlPromise === null) {
    sqlPromise = initSqlJs()
  }
  return sqlPromise
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const PK_COLUMNS = [
  'client',
  'project',
  'session_id',
  'raw_sha256',
] as const

const DATA_COLUMNS = [
  'title',
  'started_at',
  'imported_at',
  'cwd',
  'branch',
  'raw_source_path',
  'raw_upload_permission',
  'global_raw_path',
  'global_clean_path',
  'repo_raw_path',
  'repo_clean_path',
  'repo_manifest_path',
  'message_count',
  'tool_event_count',
] as const

const ALL_COLUMNS = [...PK_COLUMNS, ...DATA_COLUMNS] as const

// ---------------------------------------------------------------------------
// SQL statements (built once)
// ---------------------------------------------------------------------------

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS transcripts (
    client              TEXT    NOT NULL,
    project             TEXT    NOT NULL,
    session_id          TEXT    NOT NULL,
    raw_sha256          TEXT    NOT NULL,
    title               TEXT    NOT NULL,
    started_at          TEXT    NOT NULL,
    imported_at         TEXT    NOT NULL,
    cwd                 TEXT    NOT NULL,
    branch              TEXT    NOT NULL,
    raw_source_path     TEXT    NOT NULL,
    raw_upload_permission TEXT  NOT NULL,
    global_raw_path     TEXT    NOT NULL,
    global_clean_path   TEXT    NOT NULL,
    repo_raw_path       TEXT    NOT NULL,
    repo_clean_path     TEXT    NOT NULL,
    repo_manifest_path  TEXT    NOT NULL,
    message_count       INTEGER NOT NULL,
    tool_event_count    INTEGER NOT NULL,
    PRIMARY KEY (client, project, session_id, raw_sha256)
  )
`

const UPSERT_SQL = `
  INSERT INTO transcripts (
    ${ALL_COLUMNS.join(', ')}
  ) VALUES (${ALL_COLUMNS.map(() => '?').join(', ')})
  ON CONFLICT(${PK_COLUMNS.join(', ')}) DO UPDATE SET
    ${DATA_COLUMNS.map((c) => `${c} = excluded.${c}`).join(',\n    ')}
`

// ---------------------------------------------------------------------------
// FTS4 full-text search
//
// The FTS table is created and rebuilt inside upsertSearchIndex (the write
// path) so that searchTranscripts never pays the O(N) rebuild cost.
// ---------------------------------------------------------------------------

// FTS4 content table — no tokenize option (uses the built-in `simple` tokenizer).
const CREATE_FTS_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts4(
    content='transcripts',
    title, cwd, branch
  )
`

const REBUILD_FTS_SQL = `
  INSERT INTO transcripts_fts(transcripts_fts) VALUES('rebuild')
`

// FTS4 uses `docid`; results are ordered by started_at DESC (most recent first)
// because FTS4 does not expose a BM25 relevance score.
const SEARCH_SQL = `
  SELECT t.client, t.project, t.session_id, t.title, t.cwd, t.branch, t.started_at
  FROM transcripts_fts
  JOIN transcripts t ON transcripts_fts.docid = t.rowid
  WHERE transcripts_fts MATCH ?
  ORDER BY t.started_at DESC
  LIMIT ?
`

export interface SearchResult {
  client: string
  project: string
  session_id: string
  title: string
  cwd: string
  branch: string
  started_at: string
}

/**
 * Sanitize a user-supplied query string for safe use in an FTS4 MATCH clause.
 *
 * FTS4 MATCH interprets the bound parameter as a query expression, not a
 * plain string literal.  Characters like `"`, `*`, `(`, `)`, `-` have
 * special meaning and cause a parse error if left unescaped.
 *
 * Strategy: keep only Unicode letters, digits, apostrophes, and whitespace;
 * collapse runs of whitespace to a single space.  The result is a plain
 * multi-term AND query (e.g. `"auth bug"` → `auth bug` matches both words).
 *
 * Returns an empty string when nothing survives sanitization.
 */
export function sanitizeFtsQuery(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Full-text search over the transcript index using FTS4.
 *
 * The FTS index is maintained by `upsertSearchIndex` (write path).
 * On first search against a legacy database (no FTS table), this function
 * performs a one-time lazy rebuild so old indexes keep working.
 * Returns an empty array when the database does not exist or the sanitized
 * query is empty.
 */
export async function searchTranscripts(
  dbPath: string,
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const sanitized = sanitizeFtsQuery(query)
  if (!sanitized) return []

  const SQL = await getSqlJs()

  if (!existsSync(dbPath)) return []
  const db = new SQL.Database(readFileSync(dbPath))

  try {
    // Create FTS table if missing (legacy DB or first run).
    db.run(CREATE_FTS_SQL)

    // Lazy rebuild: if the FTS segment directory is empty the index has never
    // been populated (e.g. a DB created before the write-path rebuild was
    // added).  Rebuild once in memory so this search call returns results.
    const segRows = db.exec('SELECT COUNT(*) FROM transcripts_fts_segdir')
    const segCount = Number(segRows[0]?.values?.[0]?.[0] ?? 0)
    if (segCount === 0) {
      db.run(REBUILD_FTS_SQL)
    }

    const results: SearchResult[] = []
    const stmt = db.prepare(SEARCH_SQL)
    stmt.bind([sanitized, limit])

    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, unknown>
      results.push({
        client: String(row['client'] ?? ''),
        project: String(row['project'] ?? ''),
        session_id: String(row['session_id'] ?? ''),
        title: String(row['title'] ?? ''),
        cwd: String(row['cwd'] ?? ''),
        branch: String(row['branch'] ?? ''),
        started_at: String(row['started_at'] ?? ''),
      })
    }
    stmt.free()
    return results
  } finally {
    db.close()
  }
}

/**
 * Insert or update a single transcript manifest row in the SQLite search
 * index at `dbPath`.  Creates the database, content table, and FTS index if
 * they do not exist, and rebuilds the FTS index after each write so that
 * `searchTranscripts` never needs to rebuild it.
 *
 * The function is async because the first call must initialise the sql.js
 * WASM module.
 */
export async function upsertSearchIndex(
  dbPath: string,
  manifest: ManifestEntry,
): Promise<void> {
  const SQL = await getSqlJs()

  const db = existsSync(dbPath)
    ? new SQL.Database(readFileSync(dbPath))
    : new SQL.Database()

  try {
    db.run('PRAGMA journal_mode=WAL')
    db.run(CREATE_TABLE_SQL)

    const record: Record<string, unknown> = { ...manifest }
    const params = ALL_COLUMNS.map((col) => {
      const value = record[col]
      if (value === undefined || value === null) {
        return ''
      }
      return typeof value === 'number' ? value : String(value)
    })

    db.run(UPSERT_SQL, params)

    // Keep the FTS index in sync after every write.
    db.run(CREATE_FTS_SQL)
    db.run(REBUILD_FTS_SQL)

    const data = db.export()
    writeFileSync(dbPath, Buffer.from(data))
  } finally {
    db.close()
  }
}
