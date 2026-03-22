export interface GraphNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

export interface GraphEdge {
  fromId: string
  toId: string
  type: string
  properties?: Record<string, unknown>
}

export interface FindSessionsByEntityOptions {
  entityName?: string
  entityLabel?: string
  depth?: number
  limit?: number
}

export interface ManagedSubgraphSelector {
  managedBy: string
  managedRootId: string
}

export interface GraphAdapter {
  upsertNode(node: GraphNode): void
  upsertEdge(edge: GraphEdge): void
  deleteManagedSubgraph(selector: ManagedSubgraphSelector): void
  findRelated(entityId: string, depth: number): GraphNode[]
  findSessionsByEntity(options?: FindSessionsByEntityOptions): GraphNode[]
  query(cypher: string): unknown[]
  close(): void
}
