import { AlertTriangleIcon, GitBranchIcon, Loader2Icon, RefreshCwIcon, XIcon } from 'lucide-react'
import { useWorkspaceStore } from '@/state/workspace'
import { cn } from '@/lib/utils'

/**
 * The connection and operation strip.
 *
 * Two jobs. It says which substrate is answering, because local fixtures and a real Project must
 * never be mistaken for each other. And it is where in-flight work, conflicts and failures
 * surface — as a thin line at the edge of the workspace rather than a modal, so the graph stays
 * legible while something is happening to it.
 */
export function StatusStrip() {
  const mode = useWorkspaceStore((state) => state.mode)
  const description = useWorkspaceStore((state) => state.substrateDescription)
  const connection = useWorkspaceStore((state) => state.connection)
  const pending = useWorkspaceStore((state) => state.pending)
  const failure = useWorkspaceStore((state) => state.failure)
  const conflict = useWorkspaceStore((state) => state.conflict)
  const dismissFailure = useWorkspaceStore((state) => state.dismissFailure)
  const dismissConflict = useWorkspaceStore((state) => state.dismissConflict)
  const refresh = useWorkspaceStore((state) => state.refresh)

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 px-4 font-mono text-[10px] text-night-faint">
      <span
        className="flex items-center gap-1.5"
        title={description}
        aria-label={`Substrate: ${description}`}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            connection === 'ready'
              ? mode === 'connected'
                ? 'bg-signal-green'
                : 'bg-signal-blue'
              : connection === 'interrupted'
                ? 'bg-signal-red'
                : 'bg-signal-amber'
          )}
        />
        <span className="uppercase tracking-[0.14em]">
          {mode === 'connected' ? 'connected' : 'local'}
        </span>
        <span className="hidden text-night-faint/60 sm:inline">· {description}</span>
      </span>

      {pending.length > 0 ? (
        <span className="flex items-center gap-1.5 text-night-muted">
          <Loader2Icon className="h-3 w-3 animate-spin" />
          {pending.length === 1 ? pending[0]!.label : `${pending.length} operations`}
        </span>
      ) : null}

      {conflict ? (
        <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-signal-amber/30 bg-signal-amber/[0.08] px-2 py-0.5 text-signal-amber">
          <GitBranchIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{conflict.message}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="shrink-0 underline-offset-2 hover:underline"
          >
            refresh
          </button>
          <button
            type="button"
            aria-label="Dismiss conflict"
            onClick={dismissConflict}
            className="shrink-0 hover:text-night-text"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ) : null}

      {failure ? (
        <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-signal-red/30 bg-signal-red/[0.07] px-2 py-0.5 text-signal-red">
          <AlertTriangleIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{failure.message}</span>
          {failure.retryable ? (
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex shrink-0 items-center gap-1 underline-offset-2 hover:underline"
            >
              <RefreshCwIcon className="h-3 w-3" /> retry
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={dismissFailure}
            className="shrink-0 hover:text-night-text"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ) : null}
    </div>
  )
}
