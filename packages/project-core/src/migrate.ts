import type { EngineSnapshot } from './engine'

/**
 * Persisted snapshot format version.
 *
 * v1 — Platform Three's `atlas-workspace-v1`: the domain was named `process`, so selectors were
 *      tagged `process_field` and events carried `create_process` / `change_process_state` /
 *      `update_process_tags` operation types.
 * v2 — Platform Four: the same semantics under Project vocabulary.
 */
export const SNAPSHOT_VERSION = 2

/** A snapshot as it sits in storage, with the version tag Platform Four writes. */
export type VersionedSnapshot = EngineSnapshot & { readonly snapshotVersion?: number }

const OPERATION_TYPE_V1_TO_V2: Readonly<Record<string, string>> = {
  create_process: 'create_project',
  change_process_state: 'change_project_status',
  update_process_tags: 'update_project_tags',
}

/**
 * Upgrades a stored snapshot to the current format, returning null for anything unrecognisable.
 *
 * This exists so a Platform Three workspace already in a browser's `localStorage` survives the
 * rename rather than being silently discarded: an untagged snapshot is treated as v1 and has its
 * projection selectors and event operation types rewritten in place.
 *
 * Migration is deliberately total — it never throws — because a failed migration must degrade to
 * "seed a fresh workspace", not to a broken workspace. The caller decides what to do with null.
 */
export function migrateSnapshot(raw: unknown): VersionedSnapshot | null {
  if (!isSnapshotShaped(raw)) return null
  const version = typeof raw.snapshotVersion === 'number' ? raw.snapshotVersion : 1
  if (version > SNAPSHOT_VERSION) return null
  if (version === SNAPSHOT_VERSION) return raw as VersionedSnapshot

  const projects = raw.projects.map((project) => {
    const record = project as Record<string, unknown>
    return {
      ...record,
      summary: migrateSummary(record.summary),
      events: Array.isArray(record.events) ? record.events.map(migrateEvent) : [],
    }
  })

  return { ...raw, projects, snapshotVersion: SNAPSHOT_VERSION } as unknown as VersionedSnapshot
}

function isSnapshotShaped(
  value: unknown
): value is { nextNumber: number; projects: unknown[]; snapshotVersion?: number } {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.nextNumber === 'number' && Array.isArray(candidate.projects)
}

/** Rewrites `process_field` projection selectors to `project_field`. */
function migrateSummary(summary: unknown): unknown {
  if (typeof summary !== 'object' || summary === null) return summary
  const record = summary as Record<string, unknown>
  const schema = record.projectionSchema
  if (typeof schema !== 'object' || schema === null) return summary
  const schemaRecord = schema as Record<string, unknown>
  if (!Array.isArray(schemaRecord.columns)) return summary

  const columns = schemaRecord.columns.map((column) => {
    if (typeof column !== 'object' || column === null) return column
    const columnRecord = column as Record<string, unknown>
    const selector = columnRecord.selector
    if (typeof selector !== 'object' || selector === null) return column
    const selectorRecord = selector as Record<string, unknown>
    if (selectorRecord.selector !== 'process_field') return column
    return {
      ...columnRecord,
      selector: { ...selectorRecord, selector: 'project_field' },
    }
  })

  return { ...record, projectionSchema: { ...schemaRecord, columns } }
}

/** Rewrites v1 event operation types to their Project-vocabulary equivalents. */
function migrateEvent(event: unknown): unknown {
  if (typeof event !== 'object' || event === null) return event
  const record = event as Record<string, unknown>
  const operationType = record.operationType
  if (typeof operationType !== 'string') return event
  const renamed = OPERATION_TYPE_V1_TO_V2[operationType]
  return renamed ? { ...record, operationType: renamed } : event
}
