import {
  BarChart3Icon,
  HistoryIcon,
  NetworkIcon,
  PlusIcon,
  SparklesIcon,
  SquareTerminalIcon,
} from 'lucide-react'
import { useWorkspaceStore, type SideTab } from '@/state/workspace'
import { cn } from '@/lib/utils'

function RailButton({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: typeof NetworkIcon
  label: string
  active?: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'mj-icon-btn relative',
        active && 'bg-white/[0.07] text-night-text shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} />
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-signal-blue px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

export function Rail() {
  const sideTab = useWorkspaceStore((state) => state.sideTab)
  const sideOpen = useWorkspaceStore((state) => state.sideOpen)
  const heroVisible = useWorkspaceStore((state) => state.heroVisible)
  const setSideTab = useWorkspaceStore((state) => state.setSideTab)
  const toggleSide = useWorkspaceStore((state) => state.toggleSide)
  const setHeroVisible = useWorkspaceStore((state) => state.setHeroVisible)
  const chat = useWorkspaceStore((state) => state.chat)
  const projects = useWorkspaceStore((state) => state.projects)

  const sideButton = (tab: SideTab) => ({
    active: sideOpen && sideTab === tab && !heroVisible,
    onClick: () => {
      setHeroVisible(false)
      setSideTab(tab)
    },
  })

  return (
    <nav className="flex h-full w-16 shrink-0 flex-col items-center gap-1.5 py-4">
      <div
        className="mb-3 grid h-9 w-9 place-items-center font-mono text-[10px] font-bold tracking-[0.14em] text-night-text"
        title="Powerfarm Workbench"
      >
        PF
      </div>
      <RailButton
        icon={PlusIcon}
        label="New / open project"
        active={heroVisible}
        onClick={() => setHeroVisible(true)}
      />
      <RailButton
        icon={NetworkIcon}
        label="Project Graph"
        active={!heroVisible && !sideOpen}
        onClick={() => {
          setHeroVisible(false)
          if (useWorkspaceStore.getState().sideOpen) toggleSide()
        }}
      />
      <RailButton icon={BarChart3Icon} label="Projection Board" {...sideButton('board')} />
      <RailButton icon={HistoryIcon} label="Activity" {...sideButton('activity')} />
      <RailButton
        icon={SparklesIcon}
        label="Ask Powerfarm"
        badge={chat.length ? Math.ceil(chat.length / 2) : undefined}
        {...sideButton('chat')}
      />
      <RailButton icon={SquareTerminalIcon} label="Operations" {...sideButton('terminal')} />
      <div className="mt-auto flex flex-col items-center gap-1.5">
        <div
          className="grid h-9 w-9 place-items-center rounded-full border border-signal-blue/30 bg-night-panel2 font-mono text-[10px] font-semibold text-signal-blue"
          title={`${projects.length} numbered projects`}
        >
          {projects.length}
        </div>
      </div>
    </nav>
  )
}
