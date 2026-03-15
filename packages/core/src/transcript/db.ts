/**
 * Transcript search index — SQLite upsert for the global transcript catalog.
 *
 * Uses sql.js (WebAssembly SQLite) so the module works without a native
 * sqlite3 binding.  The WASM init is async; we cache the resulting factory
 * promise so it is only resolved once per process.
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
// FTS5 full-text search
// ---------------------------------------------------------------------------

export interface SearchResult {
  client: string
  project: string
  session_id: string
  title: string
  cwd: string
  branch: string
  started_at: string
  rank: number
}

const CREATE_FTS_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(
    title, cwd, branch,
    content='transcripts',
    content_rowid=rowid,
    tokenize='unicode61'
  )
`

const REBUILD_FTS_SQL = `
  INSERT INTO transcripts_fts(transcripts_fts) VALUES('rebuild')
`

const SEARCH_SQL = `
  SELECT t.client, t.project, t.session_id, t.title, t.cwd, t.branch, t.started_at,
         rank
  FROM transcripts_fts
  JOIN transcripts t ON transcripts_fts.rowid = t.rowid
  WHERE transcripts_fts MATCH ?
  ORDER BY rank
  LIMIT ?
`

/**
 * Full-text search over the transcript index using FTS5.
 */
export async function searchTranscripts(
  dbPath: string,
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const SQL = await getSqlJs()

  if (!existsSync(dbPath)) return []
  const db = new SQL.Database(readFileSync(dbPath))

  try {
    db.run(CREATE_FTS_SQL)
    db.run(REBUILD_FTS_SQL)

    const results: SearchResult[] = []
    const stmt = db.prepare(SEARCH_SQL)
    stmt.bind([query, limit])

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
        rank: Number(row['rank'] ?? 0),
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
 * index at `dbPath`.  Creates the database and table if they do not exist.
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

    const data = db.export()
    writeFileSync(dbPath, Buffer.from(data))
  } finally {
    db.close()
  }
}
