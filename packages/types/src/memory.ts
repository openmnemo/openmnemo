export type MemoryUnitType =
  | 'fact'
  | 'decision'
  | 'constraint'
  | 'preference'
  | 'task'
  | 'insight'
  | 'summary'
  | 'document_chunk'

export type MemoryUnitStatus =
  | 'active'
  | 'superseded'
  | 'archived'
  | 'done'
  | 'hidden'

export type SourceAssetKind =
  | 'transcript'
  | 'document'
  | 'web'
  | 'video'
  | 'audio'
  | 'image'
  | 'manual'

export type ArchiveAnchorScope =
  | 'session'
  | 'document'
  | 'project'
  | 'manual'

export type RetrievalRefKind =
  | 'session'
  | 'memory_unit'
  | 'source_asset'
  | 'archive_anchor'
  | 'commit'

export type RetrievalSource =
  | 'fts'
  | 'vector'
  | 'graph'
  | 'commit'
  | 'mixed'

export type DataLayerSearchTarget =
  | 'session'
  | 'memory_unit'
  | 'source_asset'
  | 'archive_anchor'
  | 'mixed'

export interface SourceAnchor {
  asset_id: string
  locator?: string
  session_id?: string
  commit_ref?: string
}

export interface MemoryUnit {
  id: string
  unit_type: MemoryUnitType
  title: string
  body: string
  summary?: string
  project: string
  partition?: string
  source_kind: SourceAssetKind
  source_id: string
  source_ref?: string
  source_asset_ids: string[]
  commit_refs?: string[]
  entity_refs?: string[]
  related_unit_ids?: string[]
  supersedes?: string[]
  confidence?: number
  weight?: number
  status: MemoryUnitStatus
  created_at: string
  updated_at: string
}

export interface SourceAsset {
  id: string
  asset_kind: SourceAssetKind
  project: string
  partition?: string
  title?: string
  mime_type?: string
  text_content?: string
  source_uri?: string
  import_ref?: string
  commit_ref?: string
  created_at: string
  updated_at: string
}

export interface ArchiveAnchor {
  id: string
  scope: ArchiveAnchorScope
  title: string
  summary: string
  project: string
  partition?: string
  source_asset_ids: string[]
  memory_unit_ids: string[]
  commit_ref?: string
  created_at: string
  updated_at: string
}

export interface RetrievalScope {
  project?: string
  partition?: string
  session_id?: string
  unit_types?: MemoryUnitType[]
}

export interface RetrievalQuery {
  text: string
  limit?: number
  scope?: RetrievalScope
}

export interface RetrievalReference {
  kind: RetrievalRefKind
  id: string
  score?: number
  project?: string
  partition?: string
  source?: RetrievalSource
}

export interface SessionRecord {
  client: string
  project: string
  session_id: string
  title: string
  cwd: string
  branch: string
  started_at: string
}

export interface SessionDetail extends SessionRecord {
  clean_content?: string
  clean_path?: string
  commit_layer?: string
  message_count?: number
  tool_event_count?: number
}

export interface DataLayerSearchQuery extends RetrievalQuery {
  target?: DataLayerSearchTarget
}

export interface DataLayerSearchHit {
  ref: RetrievalReference
  session?: SessionRecord
  memory_unit?: MemoryUnit
  source_asset?: SourceAsset
  archive_anchor?: ArchiveAnchor
}

export interface DataLayerSearchResponse {
  query: DataLayerSearchQuery
  hits: DataLayerSearchHit[]
}

export interface DataLayerListSessionsFilter {
  project?: string
  client?: string
  branch?: string
  started_after?: string
  started_before?: string
  limit?: number
  cursor?: string
}

export interface DataLayerListSessionsPage {
  items: SessionRecord[]
  next_cursor?: string
}

export interface EntityGraphNodeView {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

export interface EntityGraphEdgeView {
  from_id: string
  to_id: string
  type: string
  properties?: Record<string, unknown>
}

export interface EntityGraphView {
  nodes: EntityGraphNodeView[]
  edges: EntityGraphEdgeView[]
}

export interface CommitContext {
  session_id: string
  commit_refs: string[]
  commit_layer?: string
}

export interface RetrievalTools {
  searchSessions(query: RetrievalQuery): Promise<RetrievalReference[]>
  searchMemoryUnits(query: RetrievalQuery): Promise<RetrievalReference[]>
  searchSourceAssets?(query: RetrievalQuery): Promise<RetrievalReference[]>
  searchArchiveAnchors?(query: RetrievalQuery): Promise<RetrievalReference[]>
  getSourceAsset(id: string): Promise<SourceAsset | null>
  getArchiveAnchor(id: string): Promise<ArchiveAnchor | null>
  getCommitContext?(commitRef: string): Promise<Record<string, unknown> | null>
}
