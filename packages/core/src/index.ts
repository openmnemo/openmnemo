/**
 * @openmnemo/core — transcript parsing, import, dedup, indexing, and recall.
 */

// Re-export types
export type {
  Client,
  ParsedTranscript,
  TranscriptMessage,
  TranscriptToolEvent,
  ManifestEntry,
} from '@openmnemo/types'

// Common utilities
export {
  CLIENTS,
  TEXT_BLOCK_TYPES,
  SKIP_BLOCK_TYPES,
  TOOL_USE_TYPES,
  TOOL_RESULT_TYPES,
  slugify,
  sha256File,
  contentHash,
  normalizeTimestamp,
  earliestTimestamp,
  parseIsoTimestamp,
  timestampPartition,
  joinParagraphs,
  summarizeValue,
  truncate,
  yamlEscape,
  ensureDict,
  ensureList,
  getNested,
  loadJsonl,
  loadJson,
  extractTextBlocks,
  extractSimpleText,
  extractGeminiText,
  extractGeminiParts,
  findFirstMappingWithKeys,
  deduplicateMessages,
  deduplicateToolEvents,
} from './transcript/common.js'

// Parsing
export {
  inferClient,
  parseTranscript,
  parseCodexTranscript,
  parseClaudeTranscript,
  parseGeminiTranscript,
  parseDoubaoTranscript,
} from './transcript/parse.js'

// Database
export { upsertSearchIndex, searchTranscripts, searchTranscriptsByColumns, sanitizeFtsQuery, initSchema, rebuildFtsIndex } from './transcript/db.js'
export type { SearchResult } from './transcript/db.js'

// Discovery
export {
  defaultGlobalTranscriptRoot,
  defaultClientRoots,
  discoverSourceFiles,
  inferProjectSlug,
  transcriptMatchesRepo,
  projectSlugsMatch,
  safeFileMtime,
} from './transcript/discover.js'

// Import
export {
  importTranscript,
  transcriptHasContent,
  writeCleanMarkdown,
  preserveExistingImportTimestamp,
  manifestSignature,
  manifestChanged,
  writeJson,
  appendJsonl,
  copyFile,
} from './transcript/import.js'

// Recall
export {
  recall,
  searchRecall,
  syncCurrentProject,
  findLatestSession,
  findLatestFromJsonl,
  cwdMatches,
  formatText as formatRecallText,
} from './recall/recall.js'
export type { RecallResult, SearchRecallResult } from './recall/recall.js'

// Utils
export { toPosixPath } from './utils/path.js'
export { execCommand, git, buildCommitLayer } from './utils/exec.js'

// Storage adapters
export type { StorageAdapter } from './storage/adapter.js'
export { LocalAdapter } from './storage/local-adapter.js'
export { GiteaAdapter } from './storage/gitea-adapter.js'
export type { GiteaAdapterOptions } from './storage/gitea-adapter.js'

// Search adapter
export type { SearchAdapter, SearchOptions } from './storage/search/search-adapter.js'
export { SqliteFtsAdapter } from './storage/search/sqlite-fts-adapter.js'

// Vector adapter
export type { VectorAdapter, VectorMetadata, VectorResult } from './storage/vector/vector-adapter.js'
export { SqliteVecAdapter } from './storage/vector/sqlite-vec-adapter.js'

// Graph adapter
export type { GraphAdapter, GraphNode, GraphEdge } from './storage/graph/graph-adapter.js'
export { SqliteGraphAdapter } from './storage/graph/sqlite-graph-adapter.js'

// Storage factory
export type { StorageConfig } from './storage/factory.js'
export { createSearchAdapter, createVectorAdapter, createGraphAdapter } from './storage/factory.js'
