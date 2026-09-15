import { create } from 'zustand'
import { layoutGraph, type ProjectEdge, type ProjectNode } from '@powerfarm/project-core'

/**
 * Personal canvas layout — viewport and node positions.
 *
 * This is deliberately separate from Project state. "Node A depends on node B" is Project truth
 * and belongs in the durable graph; "node A sits at x=412" is how one person arranged their
 * workspace, and dragging a node must never manufacture a semantic Project mutation or burn a
 * Project version. Layout stays browser-local, keyed per Project.
 */

export interface CanvasPoint {
  readonly x: number
  readonly y: number
}

export interface Viewport {
  /** Pan offset in screen pixels. */
  readonly x: number
  readonly y: number
  /** Zoom factor. */
  readonly scale: number
}

export const MIN_SCALE = 0.25
export const MAX_SCALE = 2.5

/** World-space size used for hit-testing, fitting and default placement. */
export const NODE_WIDTH = 210
export const NODE_HEIGHT = 54

const STORAGE_KEY = 'powerfarm.workbench.canvas.v1'

interface PersistedCanvas {
  positions: Record<string, CanvasPoint>
  viewport?: Viewport
}

type CanvasByProject = Record<string, PersistedCanvas>

function loadAll(): CanvasByProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CanvasByProject) : {}
  } catch {
    return {}
  }
}

function persistAll(all: CanvasByProject): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch (error) {
    console.warn('[powerfarm] canvas layout could not be saved', error)
  }
}

export const DEFAULT_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 }

interface CanvasStore {
  projectKey: string
  positions: Record<string, CanvasPoint>
  viewport: Viewport
  /** Node currently being dragged, so the canvas can suppress its transition. */
  draggingNodeId: string | null

  loadFor: (projectKey: string) => void
  /**
   * Seeds positions for nodes that have none, using the deterministic layered layout as a
   * starting point. Never moves a node the user has already placed.
   */
  ensurePositions: (nodes: readonly ProjectNode[], edges: readonly ProjectEdge[]) => void
  moveNode: (nodeId: string, point: CanvasPoint) => void
  setDragging: (nodeId: string | null) => void
  setViewport: (viewport: Viewport) => void
  panBy: (dx: number, dy: number) => void
  zoomAt: (factor: number, origin: CanvasPoint) => void
  /** Frames every live node inside the given viewport size. */
  fitTo: (size: { width: number; height: number }, nodeIds: readonly string[]) => void
  focusNode: (nodeId: string, size: { width: number; height: number }) => void
  resetLayout: (nodes: readonly ProjectNode[], edges: readonly ProjectEdge[]) => void
}

export const useCanvasStore = create<CanvasStore>()((set, get) => {
  function persist(): void {
    const { projectKey, positions, viewport } = get()
    const all = loadAll()
    all[projectKey] = { positions, viewport }
    persistAll(all)
  }

  return {
    draggingNodeId: null,
    positions: {},
    projectKey: 'default',
    viewport: DEFAULT_VIEWPORT,

    loadFor: (projectKey) => {
      const stored = loadAll()[projectKey]
      set({
        positions: stored?.positions ?? {},
        projectKey,
        viewport: stored?.viewport ?? DEFAULT_VIEWPORT,
      })
    },

    ensurePositions: (nodes, edges) => {
      const live = nodes.filter((node) => node.tombstonedAt === null)
      const existing = get().positions
      const missing = live.filter((node) => !existing[node.id])
      if (missing.length === 0) return

      // Seed from the deterministic layered layout, which already emits world pixels.
      const seeded = layoutGraph(nodes, edges)
      const next = { ...existing }
      for (const node of missing) {
        next[node.id] = seeded.get(node.id) ?? nextFreeSlot(next)
      }
      set({ positions: next })
      persist()
    },

    moveNode: (nodeId, point) => {
      set((state) => ({ positions: { ...state.positions, [nodeId]: point } }))
      persist()
    },

    setDragging: (nodeId) => set({ draggingNodeId: nodeId }),

    setViewport: (viewport) => {
      set({ viewport: clampViewport(viewport) })
      persist()
    },

    panBy: (dx, dy) => {
      set((state) => ({
        viewport: { ...state.viewport, x: state.viewport.x + dx, y: state.viewport.y + dy },
      }))
      persist()
    },

    zoomAt: (factor, origin) => {
      const { viewport } = get()
      const scale = clampScale(viewport.scale * factor)
      if (scale === viewport.scale) return
      // Keep the world point under the cursor fixed while the scale changes.
      const ratio = scale / viewport.scale
      set({
        viewport: {
          scale,
          x: origin.x - (origin.x - viewport.x) * ratio,
          y: origin.y - (origin.y - viewport.y) * ratio,
        },
      })
      persist()
    },

    fitTo: (size, nodeIds) => {
      const positions = get().positions
      const points = nodeIds.map((id) => positions[id]).filter((point): point is CanvasPoint => !!point)
      if (points.length === 0 || size.width === 0 || size.height === 0) {
        set({ viewport: DEFAULT_VIEWPORT })
        persist()
        return
      }

      const padding = 72
      const minX = Math.min(...points.map((point) => point.x)) - NODE_WIDTH / 2
      const maxX = Math.max(...points.map((point) => point.x)) + NODE_WIDTH / 2
      const minY = Math.min(...points.map((point) => point.y)) - NODE_HEIGHT / 2
      const maxY = Math.max(...points.map((point) => point.y)) + NODE_HEIGHT / 2

      // Fit zooms out to frame the graph; it never magnifies past natural size, or a three-node
      // project would open at 250% and look like a different product from a thirty-node one.
      const scale = clampScale(
        Math.min(
          1,
          (size.width - padding * 2) / Math.max(maxX - minX, 1),
          (size.height - padding * 2) / Math.max(maxY - minY, 1)
        )
      )
      set({
        viewport: {
          scale,
          x: size.width / 2 - ((minX + maxX) / 2) * scale,
          y: size.height / 2 - ((minY + maxY) / 2) * scale,
        },
      })
      persist()
    },

    focusNode: (nodeId, size) => {
      const point = get().positions[nodeId]
      if (!point) return
      const { scale } = get().viewport
      set({
        viewport: { scale, x: size.width / 2 - point.x * scale, y: size.height / 2 - point.y * scale },
      })
      persist()
    },

    resetLayout: (nodes, edges) => {
      set({ positions: {} })
      get().ensurePositions(nodes, edges)
      persist()
    },
  }
})

/**
 * Somewhere to put a node the layout could not place, offset from whatever is already there so
 * two unplaceable nodes never land on top of each other.
 */
function nextFreeSlot(placed: Record<string, CanvasPoint>): CanvasPoint {
  const count = Object.keys(placed).length
  return { x: (count % 6) * 60, y: Math.floor(count / 6) * 60 }
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

function clampViewport(viewport: Viewport): Viewport {
  return { ...viewport, scale: clampScale(viewport.scale) }
}

/** Screen point -> world point, for hit-testing and drop positions. */
export function toWorld(point: CanvasPoint, viewport: Viewport): CanvasPoint {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale }
}
