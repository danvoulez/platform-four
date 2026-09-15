import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FolderKanbanIcon,
  HistoryIcon,
  RouteIcon,
  SendHorizonalIcon,
} from 'lucide-react'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@powerfarm/project-core'
import { useWorkspaceStore, type ChatCard } from '@/state/workspace'
import { cn } from '@/lib/utils'

const SUGGESTIONS = ["what's happening?", "what's blocking this?", 'what changed?', "what's next?"]

function ThinkingBubble({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-2xl border border-white/[0.07] bg-night-bg/60 px-3 py-2.5">
      <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-signal-blue" />
      <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-signal-blue" />
      <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-signal-blue" />
      <span className="ml-1 font-mono text-[10px] text-night-faint">{label}</span>
    </div>
  )
}

function CardShell({
  icon: Icon,
  title,
  tint,
  children,
}: {
  icon: typeof RouteIcon
  title: string
  tint: string
  children: ReactNode
}) {
  return (
    <div className="chat-card-in mt-2 overflow-hidden rounded-xl border border-white/[0.08] bg-night-panel2/80">
      <div
        className={cn(
          'flex items-center gap-1.5 border-b border-white/[0.06] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider',
          tint
        )}
      >
        <Icon className="h-3 w-3" /> {title}
      </div>
      <div className="px-2.5 py-2">{children}</div>
    </div>
  )
}

/**
 * Assistant output is typed, not Markdown.
 *
 * The substrate streams semantic events; the Workbench decides which of them earn a card and
 * which are absorbed into one calm progress line. Flattening everything to text would throw that
 * distinction away.
 */
function CardBody({ card }: { card: ChatCard }) {
  const openProject = useWorkspaceStore((state) => state.openProject)

  switch (card.type) {
    case 'status':
      return (
        <CardShell icon={CheckCircle2Icon} title="project status" tint="text-signal-blue">
          <div className="text-[12px] font-semibold text-night-text">
            #{card.number} · {card.title}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {[
              ['status', PROJECT_STATUS_LABELS[card.status as ProjectStatus] ?? card.status],
              ['version', `v${card.version}`],
              ['graph', `${card.nodes}n · ${card.edges}e`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-night-bg/70 px-2 py-1.5">
                <div className="font-mono text-[10px] uppercase text-night-faint">{label}</div>
                <div className="mt-0.5 font-mono text-[11px] text-night-text">{value}</div>
              </div>
            ))}
          </div>
          {card.summary ? (
            <div className="mt-1.5 text-[11px] leading-4 text-night-muted">{card.summary}</div>
          ) : null}
        </CardShell>
      )
    case 'next':
      return (
        <CardShell icon={RouteIcon} title="next action" tint="text-signal-green">
          {card.nextAction ? (
            <div className="text-[12px] leading-5 text-night-text">{card.nextAction}</div>
          ) : (
            <div className="font-mono text-[10px] text-night-faint">none defined</div>
          )}
          {card.pending.length ? (
            <div className="mt-1.5 border-t border-white/[0.06] pt-1.5">
              {card.pending.map((item) => (
                <div key={item} className="py-0.5 font-mono text-[10px] text-night-muted">
                  · {item}
                </div>
              ))}
            </div>
          ) : null}
        </CardShell>
      )
    case 'blockers':
      return (
        <CardShell icon={AlertTriangleIcon} title="blockers" tint="text-signal-red">
          {card.items.length ? (
            card.items.map((item) => (
              <div key={item} className="py-0.5 text-[12px] leading-4 text-night-text">
                · {item}
              </div>
            ))
          ) : (
            <div className="font-mono text-[10px] text-night-faint">none live</div>
          )}
        </CardShell>
      )
    case 'history':
      return (
        <CardShell icon={HistoryIcon} title="recent activity" tint="text-night-faint">
          {card.items.length ? (
            card.items.map((item, index) => (
              <div key={index} className="flex items-center justify-between gap-2 py-0.5">
                <span className="min-w-0 truncate text-[11px] text-night-muted">{item.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-night-faint">
                  v{item.version}
                </span>
              </div>
            ))
          ) : (
            <div className="font-mono text-[10px] text-night-faint">nothing recorded</div>
          )}
        </CardShell>
      )
    case 'node':
      return (
        <CardShell icon={CheckCircle2Icon} title={card.kind} tint="text-signal-blue">
          <div className="text-[12px] font-medium text-night-text">{card.label}</div>
          <div className="mt-0.5 font-mono text-[10px] text-night-faint">{card.id}</div>
        </CardShell>
      )
    case 'projects':
      return (
        <CardShell icon={FolderKanbanIcon} title="registry" tint="text-signal-blue">
          {card.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openProject(item.id)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span className="font-mono text-[11px] font-semibold text-signal-blue">
                #{item.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-night-text">
                {item.title}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase text-night-faint">
                {item.status.replace('_', ' ')}
              </span>
            </button>
          ))}
        </CardShell>
      )
  }
}

export function ChatView() {
  const chat = useWorkspaceStore((state) => state.chat)
  const askPowerfarm = useWorkspaceStore((state) => state.askPowerfarm)
  const summary = useWorkspaceStore((state) => state.snapshot?.summary ?? null)
  const mode = useWorkspaceStore((state) => state.mode)
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    void askPowerfarm(text)
    setText('')
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {chat.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.09] p-3">
            <div className="font-mono text-[10px] leading-4 text-night-faint">
              {mode === 'local'
                ? `Local mode: answers come from the Project graph${summary ? ` (#${summary.number})` : ''} only. Connect a Project to investigate real software.`
                : `Grounded in project ${summary ? `#${summary.number}` : ''} and its software.`}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void askPowerfarm(suggestion)}
                  className="rounded-lg border border-white/[0.08] bg-night-panel2 px-2 py-1 text-[11px] text-night-muted transition-colors hover:border-white/[0.18] hover:text-night-text"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {chat.map((message) => (
          <div
            key={message.id}
            className={cn('mb-2 flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {message.streaming && !message.text ? (
              <ThinkingBubble label={message.status ?? 'thinking'} />
            ) : (
              <div className={cn('max-w-[88%]', message.role === 'user' ? '' : 'w-full max-w-full')}>
                <div
                  className={cn(
                    'rounded-2xl px-3 py-2 text-[12px] leading-5',
                    message.role === 'user'
                      ? 'bg-signal-blue/15 text-night-text'
                      : 'border border-white/[0.07] bg-night-bg/60 text-night-muted'
                  )}
                >
                  {message.text}
                  {message.streaming ? (
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-caret-blink bg-signal-blue/70 align-middle" />
                  ) : null}
                </div>
                {message.status && message.text ? (
                  <div className="mt-1 px-1 font-mono text-[10px] text-night-faint">
                    {message.status}
                  </div>
                ) : null}
                {message.card ? <CardBody card={message.card} /> : null}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-white/[0.06] pt-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask Powerfarm…"
          aria-label="Ask Powerfarm"
          className="h-9 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-night-bg/70 px-3 text-[12px] text-night-text outline-none placeholder:text-night-faint focus:border-white/[0.16]"
        />
        <button
          type="submit"
          aria-label="Send"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-signal-blue/15 text-signal-blue transition-colors hover:bg-signal-blue/25"
        >
          <SendHorizonalIcon className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
