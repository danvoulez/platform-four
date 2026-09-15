import { PictureInPicture2Icon } from 'lucide-react'
import { useWorkspaceStore, type SideTab } from '@/state/workspace'
import { useLayoutStore, VIEW_BOXES, type ViewBoxId } from '@/state/layout'
import { InspectorView } from '@/components/views/InspectorView'
import { BoardView } from '@/components/views/BoardView'
import { ActivityView } from '@/components/views/ActivityView'
import { ChatView } from '@/components/views/ChatView'
import { TerminalView } from '@/components/views/TerminalView'
import { cn } from '@/lib/utils'

const TAB_LABELS: Record<ViewBoxId, string> = {
  activity: 'Activity',
  board: 'Board',
  copilot: 'Powerfarm',
  inspector: 'Inspector',
  ops: 'Ops',
}

const TAB_TO_SIDETAB: Record<ViewBoxId, SideTab> = {
  activity: 'activity',
  board: 'board',
  copilot: 'chat',
  inspector: 'inspect',
  ops: 'terminal',
}

const SIDETAB_TO_TAB: Record<SideTab, ViewBoxId> = {
  activity: 'activity',
  board: 'board',
  chat: 'copilot',
  inspect: 'inspector',
  terminal: 'ops',
}

export function viewForTab(tab: ViewBoxId) {
  switch (tab) {
    case 'inspector':
      return <InspectorView />
    case 'board':
      return <BoardView />
    case 'activity':
      return <ActivityView />
    case 'copilot':
      return <ChatView />
    case 'ops':
      return <TerminalView />
  }
}

export function ConsoleBox() {
  const sideTab = useWorkspaceStore((state) => state.sideTab)
  const setSideTab = useWorkspaceStore((state) => state.setSideTab)
  const summary = useWorkspaceStore((state) => state.snapshot?.summary ?? null)
  const popped = useLayoutStore((state) => state.popped)
  const popOut = useLayoutStore((state) => state.popOut)

  const tabs = VIEW_BOXES.filter((view) => !popped.includes(view))
  const activeTab = tabs.includes(SIDETAB_TO_TAB[sideTab]) ? SIDETAB_TO_TAB[sideTab] : tabs[0]

  if (tabs.length === 0) {
    return (
      <div className="p-3 font-mono text-[10px] text-night-faint">
        all views popped out · dock one back to restore the panel
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 px-1">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-night-bg/70 p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSideTab(TAB_TO_SIDETAB[tab])}
              className={cn(
                'shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                activeTab === tab
                  ? 'bg-white/[0.09] text-night-text'
                  : 'text-night-faint hover:text-night-text'
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        {activeTab ? (
          <button
            type="button"
            title="pop out into its own box"
            onClick={() => popOut(activeTab)}
            className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg text-night-faint transition-colors hover:bg-white/[0.05] hover:text-night-text"
          >
            <PictureInPicture2Icon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex h-6 shrink-0 items-center justify-between px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-night-faint">
        <span>{activeTab ? TAB_LABELS[activeTab] : ''}</span>
        <span>{summary ? `#${summary.number} · v${summary.version}` : '—'}</span>
      </div>

      <div className="min-h-0 flex-1">{activeTab ? viewForTab(activeTab) : null}</div>
    </div>
  )
}
