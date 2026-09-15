import { create } from 'zustand'

export type BoxSize = 'inline' | 'small' | 'extended'
export type DockSide = 'left' | 'right'

/** Boxes with fixed identity. Views also exist as console tabs until popped out. */
export type BoxId =
  | 'project'
  | 'graph-tools'
  | 'canvas'
  | 'console'
  | 'inspector'
  | 'board'
  | 'activity'
  | 'copilot'
  | 'ops'

export const VIEW_BOXES = ['inspector', 'board', 'activity', 'copilot', 'ops'] as const
export type ViewBoxId = (typeof VIEW_BOXES)[number]

export const BOX_TITLES: Record<BoxId, string> = {
  activity: 'History',
  board: 'Board',
  canvas: 'Canvas',
  console: 'Panel',
  copilot: 'Copilot',
  'graph-tools': 'Graph',
  inspector: 'Inspector',
  ops: 'Ops',
  project: 'Project',
}

interface LayoutState {
  order: Record<DockSide, BoxId[]>
  popped: ViewBoxId[]
  sizes: Partial<Record<BoxId, BoxSize>>
}

const DEFAULT_LAYOUT: LayoutState = {
  order: {
    left: ['project', 'graph-tools', 'canvas'],
    right: ['console'],
  },
  popped: [],
  sizes: { canvas: 'inline', console: 'extended' },
}

const STORAGE_KEY = 'powerfarm.workbench.layout.v1'

type LayoutByProject = Record<string, LayoutState>

function loadAll(): LayoutByProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LayoutByProject) : {}
  } catch {
    return {}
  }
}

function persistAll(all: LayoutByProject) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

function sanitize(layout: LayoutState | undefined): LayoutState {
  if (!layout) return structuredClone(DEFAULT_LAYOUT)
  const valid = new Set<string>([...Object.keys(BOX_TITLES)])
  const order = {
    left: (layout.order?.left ?? []).filter((id) => valid.has(id)),
    right: (layout.order?.right ?? []).filter((id) => valid.has(id)),
  }
  for (const id of DEFAULT_LAYOUT.order.left) {
    if (!order.left.includes(id) && !order.right.includes(id)) order.left.push(id)
  }
  if (!order.right.includes('console') && !order.left.includes('console')) {
    order.right.push('console')
  }
  const popped = (layout.popped ?? []).filter((id): id is ViewBoxId =>
    (VIEW_BOXES as readonly string[]).includes(id)
  )
  for (const id of popped) {
    if (!order.left.includes(id) && !order.right.includes(id)) order.right.push(id)
  }
  return { order, popped, sizes: layout.sizes ?? {} }
}

interface LayoutStore extends LayoutState {
  projectKey: string
  loadFor: (projectKey: string) => void
  cycleSize: (box: BoxId) => void
  moveBox: (box: BoxId, side: DockSide, index: number) => void
  popOut: (view: ViewBoxId) => void
  dockBack: (view: ViewBoxId) => void
  resetLayout: () => void
}

const SIZE_CYCLE: Record<BoxSize, BoxSize> = {
  extended: 'inline',
  inline: 'small',
  small: 'extended',
}

export const useLayoutStore = create<LayoutStore>()((set, get) => {
  function persist() {
    const { projectKey, order, popped, sizes } = get()
    const all = loadAll()
    all[projectKey] = { order, popped, sizes }
    persistAll(all)
  }

  return {
    ...structuredClone(DEFAULT_LAYOUT),
    projectKey: 'default',

    loadFor: (projectKey) => {
      const all = loadAll()
      set({ ...sanitize(all[projectKey]), projectKey })
    },

    cycleSize: (box) => {
      const current = get().sizes[box] ?? 'small'
      set((state) => ({ sizes: { ...state.sizes, [box]: SIZE_CYCLE[current] } }))
      persist()
    },

    moveBox: (box, side, index) => {
      set((state) => {
        const order = {
          left: state.order.left.filter((id) => id !== box),
          right: state.order.right.filter((id) => id !== box),
        }
        const clamped = Math.max(0, Math.min(index, order[side].length))
        order[side].splice(clamped, 0, box)
        return { order }
      })
      persist()
    },

    popOut: (view) => {
      if (get().popped.includes(view)) return
      set((state) => ({
        order: { ...state.order, right: [...state.order.right, view] },
        popped: [...state.popped, view],
      }))
      persist()
    },

    dockBack: (view) => {
      set((state) => ({
        order: {
          left: state.order.left.filter((id) => id !== view),
          right: state.order.right.filter((id) => id !== view),
        },
        popped: state.popped.filter((id) => id !== view),
      }))
      persist()
    },

    resetLayout: () => {
      set(structuredClone(DEFAULT_LAYOUT))
      persist()
    },
  }
})

export function sizeOf(sizes: Partial<Record<BoxId, BoxSize>>, box: BoxId): BoxSize {
  return sizes[box] ?? 'small'
}
