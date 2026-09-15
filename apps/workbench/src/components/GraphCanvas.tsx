import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import {
  CircleDotIcon,
  Link2Icon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  ScanSearchIcon,
} from 'lucide-react'
import { kindSpec, nodeWorkStatus, type ProjectNode } from '@powerfarm/project-core'
import { kindIcon } from '@/domain/icons'
import {
  MAX_SCALE,
  MIN_SCALE,
  NODE_HEIGHT,
  NODE_WIDTH,
  toWorld,
  useCanvasStore,
  type CanvasPoint,
} from '@/state/canvas'
import { useWorkspaceStore } from '@/state/workspace'
import { cn } from '@/lib/utils'

/** Drag further than this and the gesture is a move, not a click. */
const DRAG_THRESHOLD_PX = 3
const KEYBOARD_NUDGE_PX = 16

function nodeClasses(node: ProjectNode, selected: boolean, linking: boolean): string {
  if (selected)
    return 'border-signal-blue/60 bg-night-panel2 text-night-text shadow-[0_0_0_3px_rgba(91,140,255,0.14),0_14px_34px_rgba(0,0,0,0.55)]'
  if (linking)
    return 'border-signal-amber/40 bg-night-panel/95 text-night-text hover:border-signal-amber/70'
  const work = nodeWorkStatus(node)
  if (node.kind === 'blocker' || work === 'blocked')
    return 'border-signal-red/30 bg-night-panel/95 text-night-text'
  if (node.kind === 'decision' || node.kind === 'pending')
    return 'border-signal-amber/30 bg-night-panel/95 text-night-text'
  if (node.kind === 'next_action' || work === 'done')
    return 'border-signal-green/30 bg-night-panel/95 text-night-text'
  if (work === 'active') return 'border-signal-blue/30 bg-night-panel/95 text-night-text'
  return 'border-white/[0.09] bg-night-panel/95 text-night-muted hover:border-white/[0.2] hover:text-night-text'
}

function iconTint(node: ProjectNode, selected: boolean): string {
  if (selected) return 'text-signal-blue'
  const work = nodeWorkStatus(node)
  if (node.kind === 'blocker' || work === 'blocked') return 'text-signal-red'
  if (node.kind === 'decision' || node.kind === 'pending') return 'text-signal-amber'
  if (node.kind === 'next_action' || work === 'done') return 'text-signal-green'
  if (work === 'active' || kindSpec(node.kind).tint === 'blue') return 'text-signal-blue'
  return 'text-night-faint'
}

function ContextTools() {
  const invokeAction = useWorkspaceStore((state) => state.invokeAction)
  const tools = ['inspect', 'link from here', 'add task', 'remove']
  return (
    <div
      className="absolute left-1/2 top-full z-30 mt-2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-white/[0.1] bg-night-panel2/95 p-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {tools.map((action) => (
        <button
          key={action}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            invokeAction(action)
          }}
          className="whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[10px] text-night-muted hover:bg-white/[0.08] hover:text-night-text"
        >
          {action}
        </button>
      ))}
    </div>
  )
}

function ViewportControls({ onFit }: { onFit: () => void }) {
  const viewport = useCanvasStore((state) => state.viewport)
  const zoomAt = useCanvasStore((state) => state.zoomAt)
  const containerCentre = useRef<CanvasPoint>({ x: 0, y: 0 })
  containerCentre.current = { x: 0, y: 0 }

  return (
    <div className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-full border border-white/[0.07] bg-night-panel/85 p-1 backdrop-blur">
      <button
        type="button"
        title="zoom out"
        aria-label="Zoom out"
        onClick={() => zoomAt(1 / 1.2, containerCentre.current)}
        className="grid h-7 w-7 place-items-center rounded-full text-night-faint hover:bg-white/[0.06] hover:text-night-text"
      >
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
      <span className="w-10 text-center font-mono text-[10px] text-night-muted">
        {Math.round(viewport.scale * 100)}%
      </span>
      <button
        type="button"
        title="zoom in"
        aria-label="Zoom in"
        onClick={() => zoomAt(1.2, containerCentre.current)}
        className="grid h-7 w-7 place-items-center rounded-full text-night-faint hover:bg-white/[0.06] hover:text-night-text"
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="fit to view"
        aria-label="Fit to view"
        onClick={onFit}
        className="grid h-7 w-7 place-items-center rounded-full text-night-faint hover:bg-white/[0.06] hover:text-night-text"
      >
        <MaximizeIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function GraphCanvas() {
  const snapshot = useWorkspaceStore((state) => state.snapshot)
  const provisionalNodes = useWorkspaceStore((state) => state.provisionalNodes)
  const selectedNodeId = useWorkspaceStore((state) => state.selectedNodeId)
  const linkSourceId = useWorkspaceStore((state) => state.linkSourceId)
  const setSelection = useWorkspaceStore((state) => state.setSelection)
  const linkNodes = useWorkspaceStore((state) => state.linkNodes)
  const cancelLink = useWorkspaceStore((state) => state.cancelLink)

  const positions = useCanvasStore((state) => state.positions)
  const viewport = useCanvasStore((state) => state.viewport)
  const draggingNodeId = useCanvasStore((state) => state.draggingNodeId)

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ height: 0, width: 0 })
  const gesture = useRef<
    | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
    | {
        kind: 'node'
        nodeId: string
        grabX: number
        grabY: number
        startX: number
        startY: number
        moved: boolean
      }
    | null
  >(null)

  const nodes = useMemo(
    () => snapshot?.nodes.filter((node) => node.tombstonedAt === null) ?? [],
    [snapshot]
  )
  const edges = useMemo(
    () => snapshot?.edges.filter((edge) => edge.tombstonedAt === null) ?? [],
    [snapshot]
  )
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  // Track the container size so fit, focus and zoom-to-centre have real numbers to work with.
  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ height: entry.contentRect.height, width: entry.contentRect.width })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const fit = useCallback(() => {
    useCanvasStore.getState().fitTo(size, nodes.map((node) => node.id))
  }, [nodes, size])

  // Frame the graph the first time a project's nodes and the container are both known.
  const framedFor = useRef<string | null>(null)
  useEffect(() => {
    const projectId = snapshot?.summary.id
    if (!projectId || nodes.length === 0 || size.width === 0) return
    if (framedFor.current === projectId) return
    framedFor.current = projectId
    if (useCanvasStore.getState().viewport === undefined) return
    fit()
  }, [fit, nodes.length, size.width, snapshot?.summary.id])

  const pointFor = useCallback(
    (id: string): CanvasPoint => positions[id] ?? { x: 0, y: 0 },
    [positions]
  )

  const handlePointerDownCanvas = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      kind: 'pan',
      originX: viewport.x,
      originY: viewport.y,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const handlePointerDownNode = (event: ReactPointerEvent<HTMLDivElement>, nodeId: string) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFor(nodeId)
    const rect = containerRef.current?.getBoundingClientRect()
    const world = toWorld(
      { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) },
      viewport
    )
    gesture.current = {
      grabX: world.x - point.x,
      grabY: world.y - point.y,
      kind: 'node',
      moved: false,
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current) return

    if (current.kind === 'pan') {
      useCanvasStore.getState().setViewport({
        scale: viewport.scale,
        x: current.originX + (event.clientX - current.startX),
        y: current.originY + (event.clientY - current.startY),
      })
      return
    }

    const travelled =
      Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY)
    if (!current.moved && travelled < DRAG_THRESHOLD_PX) return
    if (!current.moved) {
      current.moved = true
      useCanvasStore.getState().setDragging(current.nodeId)
    }

    const rect = containerRef.current?.getBoundingClientRect()
    const world = toWorld(
      { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) },
      viewport
    )
    // Moving a node is workspace layout, not Project truth — it never becomes a mutation.
    useCanvasStore
      .getState()
      .moveNode(current.nodeId, { x: world.x - current.grabX, y: world.y - current.grabY })
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    gesture.current = null
    useCanvasStore.getState().setDragging(null)
    if (!current) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    if (current.kind === 'pan') {
      const travelled =
        Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY)
      if (travelled < DRAG_THRESHOLD_PX) {
        setSelection(null)
        cancelLink()
      }
      return
    }

    if (current.moved) return
    // A press that never moved is a selection, or the second half of a link gesture.
    if (linkSourceId) {
      if (linkSourceId !== current.nodeId) void linkNodes(linkSourceId, current.nodeId, 'feeds')
      cancelLink()
      return
    }
    setSelection(current.nodeId)
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const origin = {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    }
    useCanvasStore.getState().zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, origin)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const canvas = useCanvasStore.getState()
    switch (event.key) {
      case 'Escape':
        setSelection(null)
        cancelLink()
        return
      case 'f':
      case 'F':
        fit()
        event.preventDefault()
        return
      case 'ArrowLeft':
        canvas.panBy(KEYBOARD_NUDGE_PX, 0)
        event.preventDefault()
        return
      case 'ArrowRight':
        canvas.panBy(-KEYBOARD_NUDGE_PX, 0)
        event.preventDefault()
        return
      case 'ArrowUp':
        canvas.panBy(0, KEYBOARD_NUDGE_PX)
        event.preventDefault()
        return
      case 'ArrowDown':
        canvas.panBy(0, -KEYBOARD_NUDGE_PX)
        event.preventDefault()
        return
      case 'Tab': {
        // Step through nodes in a stable order so the graph is reachable without a pointer.
        if (nodes.length === 0) return
        event.preventDefault()
        const ordered = [...nodes].sort((left, right) => left.id.localeCompare(right.id))
        const index = ordered.findIndex((node) => node.id === selectedNodeId)
        const next = ordered[(index + (event.shiftKey ? -1 : 1) + ordered.length) % ordered.length]
        if (next) {
          setSelection(next.id)
          canvas.focusNode(next.id, size)
        }
        return
      }
      default:
    }
  }

  const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Project graph"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDownCanvas}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      className={cn(
        'canvas-dots relative h-full min-h-0 flex-1 touch-none overflow-hidden rounded-2xl border border-white/[0.06] bg-night-canvas outline-none',
        'focus-visible:border-signal-blue/30',
        gesture.current?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab'
      )}
      style={{
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_42%,transparent_55%,rgba(0,0,0,0.4)_100%)]" />

      {/* Edges share the node layer's transform so they stay welded during pan and zoom. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <g style={{ transform }}>
          {edges.map((edge) => {
            const source = nodeById.get(edge.sourceNodeId)
            const target = nodeById.get(edge.targetNodeId)
            if (!source || !target) return null
            const a = pointFor(source.id)
            const b = pointFor(target.id)
            const strong = edge.relation === 'blocks' || edge.relation === 'contains'
            return (
              <line
                key={edge.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={
                  edge.relation === 'blocks'
                    ? 'rgba(229,72,77,0.4)'
                    : `rgba(255,255,255,${strong ? 0.34 : 0.2})`
                }
                strokeWidth={strong ? 1.4 : 1}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </g>
      </svg>

      <div className="absolute inset-0" style={{ transform, transformOrigin: '0 0' }}>
        {nodes.map((node) => {
          const Icon = kindIcon(node.kind)
          const point = pointFor(node.id)
          const selected = selectedNodeId === node.id
          const dragging = draggingNodeId === node.id
          return (
            <div
              key={node.id}
              role="button"
              tabIndex={-1}
              aria-pressed={selected}
              onPointerDown={(event) => handlePointerDownNode(event, node.id)}
              style={{
                height: NODE_HEIGHT,
                left: point.x,
                top: point.y,
                width: NODE_WIDTH,
              }}
              className={cn(
                'absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl border px-3 py-2 text-left shadow-[0_10px_28px_rgba(0,0,0,0.45)]',
                dragging ? 'cursor-grabbing' : 'cursor-pointer transition-all',
                nodeClasses(node, selected, linkSourceId !== null && linkSourceId !== node.id)
              )}
            >
              <Icon
                className={cn('h-3.5 w-3.5 shrink-0', iconTint(node, selected))}
                strokeWidth={1.8}
              />
              <span className="min-w-0">
                <span className="block truncate font-mono text-[11px]">{node.label}</span>
                <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-wide text-night-faint">
                  {node.kind}
                </span>
              </span>
              {selected && !linkSourceId ? <ContextTools /> : null}
            </div>
          )
        })}

        {/* Provisional nodes: asked for, not yet confirmed by the substrate. */}
        {provisionalNodes.map((node, index) => (
          <div
            key={node.id}
            style={{
              height: NODE_HEIGHT,
              left: 40 + index * 18,
              top: 40 + index * 18,
              width: NODE_WIDTH,
            }}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 animate-pulse items-center gap-2 rounded-xl border border-dashed border-signal-blue/40 bg-night-panel/60 px-3 py-2 text-left"
          >
            <CircleDotIcon className="h-3.5 w-3.5 shrink-0 text-signal-blue/70" strokeWidth={1.8} />
            <span className="min-w-0">
              <span className="block truncate font-mono text-[11px] text-night-muted">
                {node.label}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] uppercase tracking-wide text-night-faint">
                saving…
              </span>
            </span>
          </div>
        ))}
      </div>

      {nodes.length === 0 && provisionalNodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center font-mono text-[10px] text-night-faint">
            empty graph · add nodes from the tool column or Ops
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full border border-white/[0.07] bg-night-panel/85 px-3 py-1.5 font-mono text-[10px] text-night-muted backdrop-blur">
        <span>{snapshot ? `#${snapshot.summary.number}` : 'PF'}</span>
        <span className="text-night-faint">·</span>
        <span>{nodes.length} nodes</span>
        <span className="text-night-faint">·</span>
        <span>{edges.length} edges</span>
        <span className="text-night-faint">·</span>
        <span className="flex items-center gap-1 text-night-faint">
          <CircleDotIcon className="h-3 w-3" /> v{snapshot?.summary.version ?? 0}
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-night-panel/85 px-3 py-1.5 font-mono text-[10px] text-night-faint backdrop-blur">
        {linkSourceId ? (
          <Link2Icon className="h-3 w-3 text-signal-amber" />
        ) : (
          <ScanSearchIcon className="h-3 w-3 text-signal-blue" />
        )}
        {linkSourceId
          ? `link mode · choose a target for "${linkSourceId}"`
          : 'drag to pan · scroll to zoom · F to fit · Tab to step'}
      </div>

      <ViewportControls onFit={fit} />
    </div>
  )
}

export { MAX_SCALE, MIN_SCALE }
