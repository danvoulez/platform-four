import { useState, type ChangeEvent } from 'react'
import { ArrowRightIcon, FolderOpenIcon, PlusIcon, XIcon } from 'lucide-react'
import { PROJECT_STATUS_LABELS } from '@powerfarm/project-core'
import { useWorkspaceStore } from '@/state/workspace'
import { cn } from '@/lib/utils'

export function HeroOverlay() {
  const newProject = useWorkspaceStore((state) => state.newProject)
  const openProject = useWorkspaceStore((state) => state.openProject)
  const setHeroVisible = useWorkspaceStore((state) => state.setHeroVisible)
  const projects = useWorkspaceStore((state) => state.projects)
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId)
  const busy = useWorkspaceStore((state) => state.status === 'mutating' || state.status === 'loading')

  const [title, setTitle] = useState('')
  const [listOpen, setListOpen] = useState(false)

  const create = () => {
    if (!title.trim() || busy) return
    void newProject(title)
    setTitle('')
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-night-bg/65 backdrop-blur-[7px]">
      <button
        type="button"
        aria-label="Close"
        onClick={() => setHeroVisible(false)}
        className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-white/[0.08] bg-night-panel text-night-muted hover:text-night-text"
      >
        <XIcon className="h-4 w-4" />
      </button>
      <div className="flex max-h-full w-full max-w-[700px] flex-col gap-4 overflow-y-auto px-6 py-4">
        <div className="mb-1 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-night-faint">
            Powerfarm Workbench
          </div>
          <div className="mt-2 text-[15px] text-night-muted">
            understand → ask → propose → approve → durable project memory
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-night-panel/90 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.48)]">
          <textarea
            value={title}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setTitle(event.target.value)}
            rows={2}
            className="w-full resize-none bg-transparent px-2 py-1 text-[13px] leading-5 text-night-text outline-none placeholder:text-night-faint"
            placeholder="What should this project be called?"
          />
          <div className="mt-2 px-2 font-mono text-[10px] text-night-faint">
            next number: #{(projects[0]?.number ?? 0) + 1} · starts with brief, milestone and next action
          </div>
        </div>

        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="glow-blue group flex h-[104px] w-full shrink-0 items-center gap-4 rounded-2xl border border-white/[0.09] px-7 text-left shadow-[0_24px_60px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-signal-blue/40 bg-signal-blue/15 text-signal-blue">
            <PlusIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold text-night-text">New Project</span>
            <span className="mt-1 block text-[12px] text-night-muted">
              Instantiate a numbered project with a starter graph and durable event log.
            </span>
          </span>
          <ArrowRightIcon className="h-5 w-5 shrink-0 text-night-muted transition-transform group-hover:translate-x-1 group-hover:text-night-text" />
        </button>

        <button
          type="button"
          onClick={() => setListOpen(!listOpen)}
          className="glow-amber group flex h-[104px] w-full shrink-0 items-center gap-4 rounded-2xl border border-white/[0.09] px-7 text-left shadow-[0_24px_60px_rgba(0,0,0,0.5)] transition-transform hover:scale-[1.01]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-signal-amber/40 bg-signal-amber/15 text-signal-amber">
            <FolderOpenIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold text-night-text">Open Project</span>
            <span className="mt-1 block text-[12px] text-night-muted">
              {projects.length} numbered project{projects.length === 1 ? '' : 's'} in the registry.
            </span>
          </span>
          <ArrowRightIcon
            className={cn(
              'h-5 w-5 shrink-0 text-night-muted transition-transform group-hover:text-night-text',
              listOpen ? 'rotate-90' : 'group-hover:translate-x-1'
            )}
          />
        </button>

        {listOpen ? (
          <div className="rounded-2xl border border-white/[0.08] bg-night-panel/90 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.48)]">
            {projects.length === 0 ? (
              <div className="p-3 font-mono text-[10px] text-night-faint">registry empty</div>
            ) : null}
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => void openProject(project.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]',
                  project.id === activeProjectId && 'bg-white/[0.04]'
                )}
              >
                <span className="font-mono text-[11px] font-semibold text-signal-blue">
                  #{project.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-night-text">{project.title}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-wide text-night-faint">
                    {PROJECT_STATUS_LABELS[project.status]} · v{project.version}
                    {project.tags.length ? ` · ${project.tags.join(' · ')}` : ''}
                  </span>
                </span>
                {project.id === activeProjectId ? (
                  <span className="font-mono text-[10px] uppercase text-signal-green">active</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
