import { useEffect, useState } from 'react'
import {
  BarChart3Icon,
  HistoryIcon,
  NetworkIcon,
  ScanSearchIcon,
  SparklesIcon,
  SquareTerminalIcon,
} from 'lucide-react'
import { Rail } from '@/components/Rail'
import { TopBar } from '@/components/TopBar'
import { StatusStrip } from '@/components/StatusStrip'
import { Dock } from '@/components/dock/Dock'
import { GraphCanvas } from '@/components/GraphCanvas'
import { HeroOverlay } from '@/components/HeroOverlay'
import { InspectorView } from '@/components/views/InspectorView'
import { BoardView } from '@/components/views/BoardView'
import { ActivityView } from '@/components/views/ActivityView'
import { ChatView } from '@/components/views/ChatView'
import { TerminalView } from '@/components/views/TerminalView'
import { useWorkspaceStore } from '@/state/workspace'
import { cn } from '@/lib/utils'

type CenterView = 'graph' | 'inspect' | 'board' | 'activity' | 'chat' | 'terminal'

const mobileTabs = [
  { icon: NetworkIcon, id: 'graph', label: 'Graph' },
  { icon: ScanSearchIcon, id: 'inspect', label: 'Inspect' },
  { icon: BarChart3Icon, id: 'board', label: 'Board' },
  { icon: HistoryIcon, id: 'activity', label: 'Activity' },
  { icon: SparklesIcon, id: 'chat', label: 'Ask' },
  { icon: SquareTerminalIcon, id: 'terminal', label: 'Ops' },
] as const

export default function App() {
  const [centerView, setCenterView] = useState<CenterView>('graph')
  const heroVisible = useWorkspaceStore((state) => state.heroVisible)
  const sideOpen = useWorkspaceStore((state) => state.sideOpen)
  const start = useWorkspaceStore((state) => state.start)

  useEffect(() => {
    void start()
  }, [start])

  return (
    <div className="flex h-full overflow-hidden bg-night-bg text-night-text">
      <div className="hidden shrink-0 md:block">
        <Rail />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <div className="hidden lg:block">
            <Dock side="left" />
          </div>
          <div className="relative flex min-w-0 flex-1 flex-col pb-4 pt-1">
            <div className="relative flex min-h-0 flex-1 px-2 md:px-3">
              <div className={cn('hidden min-h-0 flex-1 xl:flex', 'flex-col')}>
                <GraphCanvas />
              </div>
              <div className="flex min-h-0 flex-1 flex-col xl:hidden">
                {centerView === 'graph' ? (
                  <GraphCanvas />
                ) : (
                  <div className="mj-panel min-h-0 flex-1 overflow-hidden">
                    {centerView === 'inspect' ? <InspectorView /> : null}
                    {centerView === 'board' ? <BoardView /> : null}
                    {centerView === 'activity' ? <ActivityView /> : null}
                    {centerView === 'chat' ? <ChatView /> : null}
                    {centerView === 'terminal' ? <TerminalView /> : null}
                  </div>
                )}
              </div>
              {heroVisible ? <HeroOverlay /> : null}
            </div>
          </div>
          <div className={cn('hidden xl:block', !sideOpen && 'xl:hidden')}>
            <Dock side="right" />
          </div>
        </div>
        <StatusStrip />
        <nav className="flex h-14 shrink-0 items-center justify-center gap-0.5 border-t border-white/[0.06] bg-night-panel/80 backdrop-blur xl:hidden">
          {mobileTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                useWorkspaceStore.getState().setHeroVisible(false)
                setCenterView(id)
              }}
              className={cn(
                'flex h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors sm:w-16',
                centerView === id && !heroVisible
                  ? 'bg-white/[0.07] text-night-text'
                  : 'text-night-faint hover:text-night-text'
              )}
            >
              <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
