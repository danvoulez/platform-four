import {
  AlertTriangleIcon,
  CheckSquareIcon,
  CircleDotIcon,
  ClockIcon,
  FileTextIcon,
  FlagIcon,
  NetworkIcon,
  RouteIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StickyNoteIcon,
  type LucideIcon,
} from 'lucide-react'
import { kindSpec, type KindTint } from '@powerfarm/project-core'

/**
 * Resolves the domain's stable icon names to concrete components.
 *
 * The registry in `@powerfarm/project-core` names icons as strings so it stays runtime-neutral;
 * this is where the Workbench decides what those names look like.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  'alert-triangle': AlertTriangleIcon,
  'check-square': CheckSquareIcon,
  'circle-dot': CircleDotIcon,
  clock: ClockIcon,
  'file-text': FileTextIcon,
  flag: FlagIcon,
  network: NetworkIcon,
  route: RouteIcon,
  'shield-check': ShieldCheckIcon,
  sparkles: SparklesIcon,
  'sticky-note': StickyNoteIcon,
}

export function kindIcon(kind: string): LucideIcon {
  return ICONS[kindSpec(kind).icon] ?? CircleDotIcon
}

/** Maps a semantic tint onto the `signal` palette. */
export const TINT_TEXT: Readonly<Record<KindTint, string>> = {
  amber: 'text-signal-amber',
  blue: 'text-signal-blue',
  green: 'text-signal-green',
  muted: 'text-night-faint',
  red: 'text-signal-red',
}
