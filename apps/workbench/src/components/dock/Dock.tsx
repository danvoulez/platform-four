import { useState, type DragEvent } from 'react'
import { sizeOf, useLayoutStore, type BoxId, type DockSide, type ViewBoxId } from '@/state/layout'
import { DockBox } from './DockBox'
import { ProjectBox } from '@/components/boxes/ProjectBox'
import { GraphToolsBox } from '@/components/boxes/GraphToolsBox'
import { CanvasBox } from '@/components/boxes/CanvasBox'
import { ConsoleBox } from '@/components/boxes/ConsoleBox'
import { ViewBox } from '@/components/boxes/ViewBox'
import { cn } from '@/lib/utils'

let draggedBox: BoxId | null = null

function BoxContent({ id }: { id: BoxId }) {
  switch (id) {
    case 'project':
      return <ProjectBox />
    case 'graph-tools':
      return <GraphToolsBox />
    case 'canvas':
      return <CanvasBox />
    case 'console':
      return <ConsoleBox />
    default:
      return <ViewBox view={id as ViewBoxId} />
  }
}

export function Dock({ side, className }: { side: DockSide; className?: string }) {
  const order = useLayoutStore((state) => state.order[side])
  const sizes = useLayoutStore((state) => state.sizes)
  const moveBox = useLayoutStore((state) => state.moveBox)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const anyExtended = order.some((id) => sizeOf(sizes, id) === 'extended')
  const width = side === 'left' ? 'w-[248px]' : anyExtended ? 'w-[432px]' : 'w-[356px]'

  const handleDragOver = (event: DragEvent, index: number) => {
    if (!draggedBox) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }

  const handleBoxDragOver = (event: DragEvent, index: number) => {
    if (!draggedBox) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2
    setDropIndex(before ? index : index + 1)
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    if (draggedBox !== null && dropIndex !== null) {
      const state = useLayoutStore.getState()
      const currentSide = state.order.left.includes(draggedBox) ? 'left' : 'right'
      const currentIndex = state.order[currentSide].indexOf(draggedBox)
      let target = dropIndex
      if (currentSide === side && currentIndex !== -1 && currentIndex < dropIndex) {
        target = dropIndex - 1
      }
      moveBox(draggedBox, side, target)
    }
    draggedBox = null
    setDropIndex(null)
  }

  return (
    <aside
      className={cn('flex h-full shrink-0 flex-col gap-3 overflow-y-auto pt-1', side === 'left' ? 'pb-4 pl-4 pr-1' : 'pb-4 pl-1 pr-4', width, className)}
      onDragOver={(event) => handleDragOver(event, order.length)}
      onDrop={handleDrop}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDropIndex(null) }}
    >
      {order.map((id, index) => (
        <div key={id} onDragOver={(event) => handleBoxDragOver(event, index)} className={cn(sizeOf(sizes, id) === 'extended' && 'flex min-h-[260px] flex-1 flex-col')}>
          {dropIndex === index ? <div className="drop-line mb-3" /> : null}
          <DockBox
            id={id}
            title={BOX_TITLE[id]}
            fill={id === 'console' || DOCKABLE.has(id)}
            dockBack={DOCKABLE.has(id) ? () => useLayoutStore.getState().dockBack(id as never) : undefined}
            onDragHandleStart={(box) => { draggedBox = box }}
            onDragHandleEnd={() => { draggedBox = null; setDropIndex(null) }}
          >
            <BoxContent id={id} />
          </DockBox>
        </div>
      ))}
      {dropIndex === order.length ? <div className="drop-line" /> : null}
    </aside>
  )
}

const BOX_TITLE: Record<BoxId, string> = {
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

const DOCKABLE = new Set<BoxId>(['inspector', 'board', 'activity', 'copilot', 'ops'])
