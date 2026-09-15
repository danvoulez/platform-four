import {
  AlertTriangleIcon,
  CheckSquareIcon,
  ClockIcon,
  FlagIcon,
  Link2Icon,
  ShieldCheckIcon,
} from 'lucide-react'
import { useWorkspaceStore } from '@/state/workspace'
import { BoxRow } from './ProjectBox'

export function GraphToolsBox() {
  const addNode = useWorkspaceStore((state) => state.addNode)
  const linkSourceId = useWorkspaceStore((state) => state.linkSourceId)
  const cancelLink = useWorkspaceStore((state) => state.cancelLink)

  return (
    <div>
      <BoxRow icon={CheckSquareIcon} label="Add Task" onClick={() => void addNode('task', 'New task')} />
      <BoxRow
        icon={FlagIcon}
        label="Add Milestone"
        onClick={() => void addNode('milestone', 'New milestone')}
      />
      <BoxRow
        icon={ShieldCheckIcon}
        label="Add Decision"
        onClick={() => void addNode('decision', 'New decision')}
      />
      <BoxRow
        icon={AlertTriangleIcon}
        label="Add Blocker"
        onClick={() => void addNode('blocker', 'New blocker')}
        accent="text-signal-red"
      />
      <BoxRow
        icon={ClockIcon}
        label="Add Pending Item"
        onClick={() => void addNode('pending', 'New pending item')}
      />
      {linkSourceId ? (
        <button type="button" onClick={cancelLink} className="mj-row justify-between text-signal-amber">
          <span className="flex items-center gap-2">
            <Link2Icon className="h-4 w-4" strokeWidth={1.8} />
            linking from {linkSourceId}
          </span>
          <span className="font-mono text-[10px]">cancel</span>
        </button>
      ) : null}
    </div>
  )
}
