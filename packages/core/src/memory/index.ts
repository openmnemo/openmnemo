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
} from './domain.js'

export type { DataLayerAPI, DataLayerDependencies } from './data-layer-api.js'
export { createDataLayerAPI } from './data-layer-api.js'
export type { LocalDataLayerOptions } from './local-runtime.js'
export { createLocalDataLayerAPI, createLocalRetrievalTools } from './local-runtime.js'
export type { MemoryGraphNode, MemoryGraphEdge, MemoryExtractionBundle } from './extraction.js'
export {
  TRANSCRIPT_MEMORY_EXTRACTION_VERSION,
  TRANSCRIPT_MEMORY_EXTRACTOR,
  buildTranscriptSourceAsset,
  buildTranscriptExtractionBundle,
  syncExtractionBundleGraph,
} from './extraction.js'
export {
  listMemoryExtractionPaths,
  listMemoryExtractionBundles,
  getMemoryUnit,
  getSourceAsset,
  getArchiveAnchor,
} from './catalog.js'
export {
  MEMORY_UNIT_VECTOR_NAMESPACE,
  TRANSCRIPT_MEMORY_VECTORIZER,
  MEMORY_UNIT_VECTOR_DIMS,
  syncMemoryUnitVectors,
  searchMemoryUnitVectors,
} from './vector.js'
