export interface VectorMetadata {
  [key: string]: string | number | boolean
}

export interface VectorMetadataFilter {
  [key: string]: string | number | boolean
}

export interface VectorResult {
  id: string
  score: number
  metadata: VectorMetadata
}

export interface VectorAdapter {
  upsert(id: string, embedding: number[], metadata: VectorMetadata): void
  search(embedding: number[], topK: number): VectorResult[]
  delete(id: string): void
  deleteByMetadata(filter: VectorMetadataFilter): number
  close(): void
}
