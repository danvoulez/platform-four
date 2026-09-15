import { relativeTime } from '@powerfarm/project-core'
import { useWorkspaceStore } from '@/state/workspace'
import { cn } from '@/lib/utils'

const KIND_DOT: Record<string, string> = {
  action: 'bg-signal-blue',
  governance: 'bg-signal-red',
  system: 'bg-night-faint',
  terminal: 'bg-signal-green',
}

/**
 * What happened, in a person's words.
 *
 * Transport events and raw payloads deliberately do not appear here — they stay on the durable
 * event and surface in the Inspector on request. A timeline that is readable is worth more than
 * one that is complete.
 */
export function ActivityView() {
  const activity = useWorkspaceStore((state) => state.activity)
  const summary = useWorkspaceStore((state) => state.snapshot?.summary ?? null)
  const entries = [...activity].reverse()

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-night-faint">
        what happened {summary ? `· #${summary.number}` : ''}
      </div>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.09] p-4 text-center font-mono text-[10px] text-night-faint">
          nothing yet — every change lands here, in order
        </div>
      ) : null}
      <div className="flex flex-col">
        {entries.map((entry, index) => (
          <div className="flex items-stretch gap-2" key={entry.id}>
            <div className="flex w-4 flex-col items-center">
              <span
                className={cn('mt-2.5 h-1.5 w-1.5 rounded-full', KIND_DOT[entry.kind] ?? 'bg-signal-blue')}
              />
              {index < entries.length - 1 ? <span className="w-px flex-1 bg-white/[0.08]" /> : null}
            </div>
            <div className="mb-1 flex-1 rounded-lg border border-white/[0.07] bg-night-bg/60 px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    'text-[12px] leading-4',
                    entry.kind === 'terminal'
                      ? 'font-mono text-signal-green'
                      : entry.kind === 'system'
                        ? 'font-mono text-[11px] text-night-faint'
                        : 'font-medium text-night-text'
                  )}
                >
                  {entry.message}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-night-faint">
                  {relativeTime(entry.at)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
