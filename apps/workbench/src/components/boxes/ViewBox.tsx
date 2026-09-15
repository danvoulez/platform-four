import type { ViewBoxId } from '@/state/layout'
import { viewForTab } from './ConsoleBox'

export function ViewBox({ view }: { view: ViewBoxId }) {
  return <div className="flex h-full min-h-0 flex-1 flex-col">{viewForTab(view)}</div>
}
