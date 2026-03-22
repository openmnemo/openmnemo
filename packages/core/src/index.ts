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
  MemoryUnitType,
  MemoryUnitStatus,
  SourceAssetKind,
  ArchiveAnchorScope,
  RetrievalRefKind,
  RetrievalSource,
  DataLayerSearchTarget,
  SourceAnchor,
  MemoryUnit,
  SourceAsset,
  ArchiveAnchor,
  RetrievalScope,
  RetrievalQuery,
  RetrievalReference,
  SessionRecord,
  SessionDetail,
  DataLayerSearchQuery,
  DataLayerSearchHit,
  DataLayerSearchResponse,
  DataLayerListSessionsFilter,
  DataLayerListSessionsPage,
  EntityGraphNodeView,
  EntityGraphEdgeView,
  EntityGraphView,
  CommitContext,
  RetrievalTools,
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

// Memory domain
export {
  MEMORY_UNIT_TYPES,
  MEMORY_UNIT_STATUSES,
  SOURCE_ASSET_KINDS,
  ARCHIVE_ANCHOR_SCOPES,
  RETRIEVAL_REF_KINDS,
  RETRIEVAL_SOURCES,
  DATA_LAYER_SEARCH_TARGETS,
  isMemoryUnitType,
  isMemoryUnitStatus,
  isSourceAssetKind,
  isArchiveAnchorScope,
  isRetrievalRefKind,
  isRetrievalSource,
  isDataLayerSearchTarget,
  isSourceAnchor,
  isRetrievalScope,
  isRetrievalQuery,
  isRetrievalReference,
  isSessionRecord,
  isSessionDetail,
  isMemoryUnit,
  isSourceAsset,
  isArchiveAnchor,
  isMemoryGraphNode,
  isMemoryGraphEdge,
  isMemoryExtractionBundle,
  isDataLayerSearchQuery,
  isDataLayerSearchHit,
  isDataLayerSearchResponse,
  isEntityGraphNodeView,
  isEntityGraphEdgeView,
  isEntityGraphView,
  isCommitContext,
  normalizeRetrievalQuery,
  normalizeDataLayerSearchQuery,
  toEffectiveRetrievalLimit,
  compareRetrievalReferences,
  dedupeRetrievalReferences,
  createDataLayerAPI,
  TRANSCRIPT_MEMORY_EXTRACTION_VERSION,
  TRANSCRIPT_MEMORY_EXTRACTOR,
  buildTranscriptSourceAsset,
  buildTranscriptExtractionBundle,
} from './memory/index.js'
export type {
  DataLayerAPI,
  DataLayerDependencies,
  MemoryGraphNode,
  MemoryGraphEdge,
  MemoryExtractionBundle,
} from './memory/index.js'

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
export type { GraphAdapter, GraphNode, GraphEdge, FindSessionsByEntityOptions } from './storage/graph/graph-adapter.js'
export { SqliteGraphAdapter } from './storage/graph/sqlite-graph-adapter.js'

// Storage factory
export type { StorageConfig } from './storage/factory.js'
export { createSearchAdapter, createVectorAdapter, createGraphAdapter } from './storage/factory.js'
