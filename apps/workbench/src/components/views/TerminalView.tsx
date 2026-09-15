import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { useWorkspaceStore } from '@/state/workspace'
import { cn } from '@/lib/utils'

const kindColor: Record<string, string> = {
  action: 'text-night-muted',
  governance: 'text-signal-red',
  system: 'text-night-faint',
  terminal: 'text-signal-blue',
}

/**
 * The Ops surface. Useful for expert operation, deliberately not the primary way to use the
 * Workbench — its commands go through the same client boundary as every button.
 */
export function TerminalView() {
  const activity = useWorkspaceStore((state) => state.activity)
  const submitTerminal = useWorkspaceStore((state) => state.submitTerminal)
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activity.length])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    void submitTerminal(text)
    setText('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-5">
        {activity.map((entry) => (
          <div key={entry.id} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-night-faint/60">
              {new Date(entry.at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <span className={cn('min-w-0 break-words', kindColor[entry.kind] ?? 'text-night-muted')}>
              {entry.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={submit}
        className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-3 py-2.5"
      >
        <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-signal-green" />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="help"
          aria-label="Operations command"
          className="h-7 min-w-0 flex-1 bg-transparent font-mono text-[11px] text-night-text outline-none placeholder:text-night-faint"
          spellCheck={false}
        />
      </form>
    </div>
  )
}
