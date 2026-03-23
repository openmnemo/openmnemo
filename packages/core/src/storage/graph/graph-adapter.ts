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

export interface FindNodesByEntityOptions {
  entityName?: string
  entityLabel?: string
  limit?: number
}

export interface FindSessionsByEntityOptions extends FindNodesByEntityOptions {
  depth?: number
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
  findNodesByEntity(options?: FindNodesByEntityOptions): GraphNode[]
  findSessionsByEntity(options?: FindSessionsByEntityOptions): GraphNode[]
  query(cypher: string): unknown[]
  close(): void
}
