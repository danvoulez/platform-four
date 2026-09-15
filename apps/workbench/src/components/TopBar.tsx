import { useState, type ChangeEvent, type FormEvent } from 'react'
import { ChevronDownIcon, LayoutGridIcon, PlusIcon, SparklesIcon } from 'lucide-react'
import { PROJECT_STATUS_LABELS } from '@powerfarm/project-core'
import { useWorkspaceStore, type WorkspacePreset } from '@/state/workspace'
import { useLayoutStore } from '@/state/layout'
import { cn } from '@/lib/utils'

const presets: WorkspacePreset[] = ['Design', 'Board', 'History', 'Operate']

function StatusDot({ status }: { status: string }) {
  const active = status === 'in_progress'
  const attention = status === 'blocked' || status === 'waiting'
  return (
    <span className="relative inline-flex h-1.5 w-1.5">
      {active ? (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-green/40" />
      ) : null}
      <span
        className={cn(
          'relative inline-flex h-1.5 w-1.5 rounded-full',
          active ? 'bg-signal-green' : attention ? 'bg-signal-amber' : 'bg-night-faint'
        )}
      />
    </span>
  )
}

export function TopBar() {
  const [text, setText] = useState('')
  const summary = useWorkspaceStore((state) => state.snapshot?.summary ?? null)
  const askPowerfarm = useWorkspaceStore((state) => state.askPowerfarm)
  const preset = useWorkspaceStore((state) => state.preset)
  const setPreset = useWorkspaceStore((state) => state.setPreset)
  const setHeroVisible = useWorkspaceStore((state) => state.setHeroVisible)
  const streaming = useWorkspaceStore((state) => state.status === 'streaming')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    void askPowerfarm(text)
    setText('')
  }

  return (
    <header className="flex h-[68px] shrink-0 items-center gap-3 px-4">
      <div className="hidden min-w-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-night-panel px-3 py-2 lg:flex">
        <span className="font-mono text-[11px] font-semibold text-night-text">
          {summary ? `#${summary.number}` : 'PF'}
        </span>
        <span className="max-w-[180px] truncate font-mono text-[10px] text-night-faint">
          · {summary?.title ?? 'no project'}
        </span>
        {summary ? (
          <span className="ml-1 flex items-center gap-1.5 font-mono text-[10px] uppercase text-night-muted">
            <StatusDot status={summary.status} />
            {PROJECT_STATUS_LABELS[summary.status]}
          </span>
        ) : null}
      </div>

      <form
        onSubmit={submit}
        className="mx-auto flex h-11 w-full max-w-[700px] flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-night-panel px-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] focus-within:border-white/[0.16]"
      >
        <SparklesIcon
          className={cn(
            'h-4 w-4 shrink-0 text-signal-blue',
            streaming && 'animate-pulse'
          )}
          strokeWidth={1.8}
        />
        <input
          value={text}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
          placeholder="Ask Powerfarm…"
          aria-label="Ask Powerfarm"
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-night-text outline-none placeholder:text-night-faint"
        />
        <label className="relative hidden shrink-0 sm:block">
          <span className="sr-only">Workspace preset</span>
          <select
            value={preset}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setPreset(event.target.value as WorkspacePreset)
            }
            className="h-7 appearance-none rounded-lg border border-white/[0.07] bg-night-panel2 pl-2.5 pr-7 font-mono text-[10px] text-night-muted outline-none hover:text-night-text"
          >
            {presets.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-night-faint" />
        </label>
      </form>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          title="reset panel layout"
          onClick={() => useLayoutStore.getState().resetLayout()}
          className="hidden h-9 w-9 place-items-center rounded-xl border border-white/[0.07] text-night-faint transition-colors hover:text-night-text md:grid"
        >
          <LayoutGridIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setHeroVisible(true)}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-signal-blue/30 bg-night-panel2 px-3 font-mono text-[10px] uppercase text-signal-blue transition-colors hover:bg-signal-blue/10"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Project
        </button>
      </div>
    </header>
  )
}
