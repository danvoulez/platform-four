import { CrosshairIcon, MaximizeIcon, RotateCcwIcon } from 'lucide-react'
import { MAX_SCALE, MIN_SCALE, useCanvasStore } from '@/state/canvas'
import { useWorkspaceStore } from '@/state/workspace'
import { BoxRow } from './ProjectBox'

/**
 * Canvas ergonomics. Everything here is personal layout — none of it touches Project truth or
 * advances a Project version.
 */
export function CanvasBox() {
  const viewport = useCanvasStore((state) => state.viewport)
  const setViewport = useCanvasStore((state) => state.setViewport)
  const snapshot = useWorkspaceStore((state) => state.snapshot)
  const selectedNodeId = useWorkspaceStore((state) => state.selectedNodeId)

  const liveNodes = snapshot?.nodes.filter((node) => node.tombstonedAt === null) ?? []

  // The canvas owns its measured size; these use a sensible frame and let the canvas re-fit.
  const frame = { height: 640, width: 960 }

  return (
    <div className="pb-1.5 pt-1">
      <div className="mb-2 flex items-center justify-between px-3 text-[11px]">
        <span className="text-night-muted">Zoom</span>
        <span className="font-mono text-night-faint">{Math.round(viewport.scale * 100)}%</span>
      </div>
      <input
        type="range"
        min={MIN_SCALE * 100}
        max={MAX_SCALE * 100}
        value={Math.round(viewport.scale * 100)}
        aria-label="Canvas zoom"
        onChange={(event) =>
          setViewport({ ...viewport, scale: Number(event.target.value) / 100 })
        }
        className="mx-3 h-1 w-[calc(100%-1.5rem)] cursor-pointer appearance-none rounded-full bg-white/10 accent-night-muted"
      />
      <div className="mt-2">
        <BoxRow
          icon={MaximizeIcon}
          label="Fit to view"
          onClick={() =>
            useCanvasStore.getState().fitTo(frame, liveNodes.map((node) => node.id))
          }
        />
        {selectedNodeId ? (
          <BoxRow
            icon={CrosshairIcon}
            label="Focus selection"
            onClick={() => useCanvasStore.getState().focusNode(selectedNodeId, frame)}
          />
        ) : null}
        <BoxRow
          icon={RotateCcwIcon}
          label="Reset positions"
          onClick={() =>
            useCanvasStore.getState().resetLayout(snapshot?.nodes ?? [], snapshot?.edges ?? [])
          }
        />
      </div>
    </div>
  )
}
