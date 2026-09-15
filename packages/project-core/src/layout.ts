import type { ProjectEdge, ProjectNode } from './contracts'

export interface CanvasPosition {
  readonly x: number
  readonly y: number
}

export interface LayoutOptions {
  /** Horizontal distance between layers, in world pixels. */
  readonly columnGap?: number
  /** Vertical distance between siblings within a layer, in world pixels. */
  readonly rowGap?: number
}

const DEFAULT_COLUMN_GAP = 300
const DEFAULT_ROW_GAP = 104

/**
 * Deterministic layered layout, in world pixels.
 *
 * Columns follow topological depth (longest path from a root) and rows order nodes within a layer
 * by creation time, so the same graph always lays out the same way — a node does not jump when an
 * unrelated one is added.
 *
 * Each layer is centred on y=0 and the graph starts at x=0; the canvas frames the result, so
 * absolute placement does not matter, only relative spacing. Output is a *seed*: once a node has a
 * position the user has chosen, this never moves it again.
 */
export function layoutGraph(
  nodes: readonly ProjectNode[],
  edges: readonly ProjectEdge[],
  options: LayoutOptions = {}
): Map<string, CanvasPosition> {
  const columnGap = options.columnGap ?? DEFAULT_COLUMN_GAP
  const rowGap = options.rowGap ?? DEFAULT_ROW_GAP

  const live = nodes
    .filter((node) => node.tombstonedAt === null)
    .toSorted(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    )
  const liveIds = new Set(live.map((node) => node.id))
  const liveEdges = edges.filter(
    (edge) =>
      edge.tombstonedAt === null &&
      liveIds.has(edge.sourceNodeId) &&
      liveIds.has(edge.targetNodeId)
  )

  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const node of live) {
    outgoing.set(node.id, [])
    indegree.set(node.id, 0)
  }
  for (const edge of liveEdges) {
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId)
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
  }

  const depth = new Map<string, number>()
  const queue: string[] = live
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
  for (const id of queue) depth.set(id, 0)

  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift() as string
    if (visited.has(current)) continue
    visited.add(current)
    const currentDepth = depth.get(current) ?? 0
    for (const target of outgoing.get(current) ?? []) {
      depth.set(target, Math.max(depth.get(target) ?? 0, currentDepth + 1))
      indegree.set(target, (indegree.get(target) ?? 1) - 1)
      if ((indegree.get(target) ?? 0) <= 0) queue.push(target)
    }
  }

  // A cycle leaves nodes unvisited. Pin them one layer past everything resolved rather than
  // dropping them: an unlayoutable node must still be reachable on the canvas.
  const maxResolvedDepth = depth.size > 0 ? Math.max(...depth.values()) : 0
  for (const node of live) {
    if (!depth.has(node.id)) depth.set(node.id, maxResolvedDepth + 1)
  }

  const layers = new Map<number, ProjectNode[]>()
  for (const node of live) {
    const layer = depth.get(node.id) ?? 0
    const bucket = layers.get(layer)
    if (bucket) bucket.push(node)
    else layers.set(layer, [node])
  }

  const positions = new Map<string, CanvasPosition>()
  for (const [layer, layerNodes] of layers) {
    const offset = ((layerNodes.length - 1) * rowGap) / 2
    layerNodes.forEach((node, index) => {
      positions.set(node.id, { x: layer * columnGap, y: index * rowGap - offset })
    })
  }
  return positions
}
