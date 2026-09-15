import { useState, type ChangeEvent, type ReactNode } from 'react'
import { PlusIcon, RadarIcon, TagIcon, XIcon, type LucideIcon } from 'lucide-react'
import { ALLOWED_STATUS_TRANSITIONS, PROJECT_STATUS_LABELS } from '@powerfarm/project-core'
import { useWorkspaceStore } from '@/state/workspace'
import { cn } from '@/lib/utils'

export function BoxRow({
  icon: Icon,
  label,
  onClick,
  accent,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  accent?: string
}) {
  return (
    <button type="button" className="mj-row" onClick={onClick}>
      <Icon className={cn('h-4 w-4 shrink-0 text-night-faint', accent)} strokeWidth={1.8} />
      {label}
    </button>
  )
}

export function BoxNote({ children }: { children: ReactNode }) {
  return (
    <div className="mx-1 mt-2 rounded-xl border border-white/[0.07] bg-night-bg/60 p-3 font-mono text-[10px] leading-4 text-night-faint">
      {children}
    </div>
  )
}

function TagEditor() {
  const summary = useWorkspaceStore((state) => state.snapshot?.summary ?? null)
  const addTag = useWorkspaceStore((state) => state.addTag)
  const removeTag = useWorkspaceStore((state) => state.removeTag)
  const [draft, setDraft] = useState('')

  if (!summary) return null

  const submit = () => {
    if (!draft.trim()) return
    void addTag(draft)
    setDraft('')
  }

  return (
    <div className="mt-2 px-1">
      <div className="flex flex-wrap gap-1">
        {summary.tags.map((tag) => (
          <span
            key={tag}
            className="group flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-night-muted"
          >
            {tag}
            <button
              type="button"
              aria-label={`remove ${tag}`}
              onClick={() => void removeTag(tag)}
              className="text-night-faint hover:text-signal-red"
            >
              <XIcon className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {summary.tags.length === 0 ? (
          <span className="font-mono text-[10px] text-night-faint">no tags</span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <input
          value={draft}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          placeholder="add tag"
          aria-label="Add tag"
          className="h-7 min-w-0 flex-1 rounded-lg border border-white/[0.07] bg-night-bg/70 px-2 font-mono text-[10px] text-night-text outline-none placeholder:text-night-faint focus:border-white/[0.16]"
        />
        <button
          type="button"
          onClick={submit}
          aria-label="Add"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.07] text-night-faint hover:text-night-text"
        >
          <PlusIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

export function ProjectBox() {
  const summary = useWorkspaceStore((state) => state.snapshot?.summary ?? null)
  const setHeroVisible = useWorkspaceStore((state) => state.setHeroVisible)
  const changeStatus = useWorkspaceStore((state) => state.changeStatus)

  return (
    <div>
      <BoxRow
        icon={PlusIcon}
        label="New Project"
        onClick={() => setHeroVisible(true)}
        accent="text-signal-blue"
      />
      <BoxRow icon={RadarIcon} label="Open Project" onClick={() => setHeroVisible(true)} />
      {summary ? (
        <div className="mt-1 px-1">
          <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wider text-night-faint">
            move status
          </div>
          <div className="flex flex-wrap gap-1 px-1">
            {ALLOWED_STATUS_TRANSITIONS[summary.status].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => void changeStatus(status)}
                className="rounded-md border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-night-muted transition-colors hover:border-white/[0.18] hover:text-night-text"
              >
                {PROJECT_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-1.5 px-3 font-mono text-[10px] uppercase tracking-wider text-night-faint">
        <TagIcon className="h-3 w-3" /> tags
      </div>
      <TagEditor />
    </div>
  )
}
