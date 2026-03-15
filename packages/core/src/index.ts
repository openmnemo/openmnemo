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
  RecallResult,
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
} from './transcript/parse.js'

// Database
export { upsertSearchIndex } from './transcript/db.js'

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
  syncCurrentProject,
  findLatestSession,
  findLatestFromJsonl,
  cwdMatches,
  formatText as formatRecallText,
} from './recall/recall.js'

// Utils
export { toPosixPath } from './utils/path.js'
export { execCommand, git } from './utils/exec.js'
