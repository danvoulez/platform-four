import type { ReactNode } from 'react'
import { ChevronsDownUpIcon, ChevronsUpDownIcon, GripVerticalIcon, ImportIcon, MinusIcon } from 'lucide-react'
import { sizeOf, useLayoutStore, type BoxId } from '@/state/layout'
import { cn } from '@/lib/utils'

const SIZE_ICONS = {
  extended: ChevronsDownUpIcon,
  inline: ChevronsUpDownIcon,
  small: MinusIcon,
} as const

const SIZE_HINTS = {
  extended: 'shrink to inline',
  inline: 'expand to small',
  small: 'expand to extended',
} as const

interface DockBoxProps {
  id: BoxId
  title: string
  children?: ReactNode
  dockBack?: () => void
  fill?: boolean
  headerExtra?: ReactNode
  onDragHandleStart?: (box: BoxId) => void
  onDragHandleEnd?: () => void
}

export function DockBox({ id, title, children, dockBack, fill, headerExtra, onDragHandleStart, onDragHandleEnd }: DockBoxProps) {
  const size = useLayoutStore((state) => sizeOf(state.sizes, id))
  const cycleSize = useLayoutStore((state) => state.cycleSize)
  const SizeIcon = SIZE_ICONS[size]
  const inline = size === 'inline'

  return (
    <section className={cn('mj-panel flex shrink-0 flex-col overflow-hidden', size === 'extended' && 'min-h-[260px] flex-1')}>
      <div className="flex h-11 w-full shrink-0 items-center gap-1 pl-2 pr-2">
        <span
          draggable
          onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; onDragHandleStart?.(id) }}
          onDragEnd={() => onDragHandleEnd?.()}
          className="cursor-grab text-night-faint/60 transition-colors hover:text-night-faint active:cursor-grabbing"
          title="drag to rearrange"
        >
          <GripVerticalIcon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-night-text">{title}</span>
        {headerExtra}
        {dockBack ? (
          <button type="button" onClick={dockBack} title="dock back into panel tabs" className="grid h-7 w-7 place-items-center rounded-lg text-night-faint transition-colors hover:bg-white/[0.05] hover:text-night-text">
            <ImportIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button type="button" onClick={() => cycleSize(id)} title={SIZE_HINTS[size]} className="grid h-7 w-7 place-items-center rounded-lg text-night-faint transition-colors hover:bg-white/[0.05] hover:text-night-text">
          <SizeIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {!inline ? (
        <div className={cn(
          'min-h-0 px-2 pb-2.5',
          size === 'extended'
            ? 'flex flex-1 flex-col'
            : fill
              ? 'flex h-[320px] flex-col'
              : 'max-h-[340px] overflow-y-auto'
        )}>
          {children}
        </div>
      ) : null}
    </section>
  )
}
