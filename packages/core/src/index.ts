/**
 * @openmnemo/core — transcript parsing, import, dedup, and indexing.
 *
 * Ported from memorytree-workflow TS branch (src/transcript/*).
 */

// Re-export types
export type {
  Client,
  ParsedTranscript,
  TranscriptMessage,
  TranscriptToolEvent,
  ManifestEntry,
} from '@openmnemo/types'

// Modules to be ported from memorytree-workflow:
// - parse: client inference + Codex/Claude/Gemini parsers
// - common: slugify, sha256, timestamp utils, dedup, text extraction
// - import: orchestration, cleaning, manifest management
// - discover: source file discovery, repo matching
// - db: SQLite upsert via sql.js
