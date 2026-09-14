import { migrateSnapshot, SNAPSHOT_VERSION, type EngineSnapshot } from '@powerfarm/project-core'

/**
 * Where the local adapter keeps its snapshot.
 *
 * This is a development and testing convenience, not Platform Four's source of truth. Once a
 * Project is backed by the real substrate, the server is authoritative and the browser holds only
 * cache, optimistic state and personal layout — see docs/architecture.md.
 */
export interface SnapshotStore {
  load(): EngineSnapshot | null
  save(snapshot: EngineSnapshot): void
  clear(): void
}

const STORAGE_KEY = 'powerfarm.workbench.local-projects.v2'
/** Platform Three's key, read once so an existing prototype workspace survives the rename. */
const LEGACY_STORAGE_KEY = 'atlas-workspace-v1'

/** A store that keeps everything in memory. The default in tests and on a server. */
export function memorySnapshotStore(initial: EngineSnapshot | null = null): SnapshotStore {
  let held = initial
  return {
    load: () => held,
    save: (snapshot) => {
      held = snapshot
    },
    clear: () => {
      held = null
    },
  }
}

/**
 * A store backed by `localStorage`, migrating a Platform Three snapshot on first read.
 *
 * Reads are total: corrupt or unreadable storage yields null so the caller seeds a fresh
 * workspace. Writes are not silently swallowed — `onWriteError` is called so the caller can
 * surface that local persistence stopped working rather than pretending it is fine.
 */
export function browserSnapshotStore(options: {
  readonly storage?: Storage
  readonly onWriteError?: (error: unknown) => void
} = {}): SnapshotStore {
  const storage = options.storage ?? globalThis.localStorage
  return {
    load() {
      const migrated = readAndMigrate(storage, STORAGE_KEY) ?? readAndMigrate(storage, LEGACY_STORAGE_KEY)
      return migrated
    },
    save(snapshot) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ ...snapshot, snapshotVersion: SNAPSHOT_VERSION }))
      } catch (error) {
        options.onWriteError?.(error)
      }
    },
    clear() {
      try {
        storage.removeItem(STORAGE_KEY)
        storage.removeItem(LEGACY_STORAGE_KEY)
      } catch (error) {
        options.onWriteError?.(error)
      }
    },
  }
}

function readAndMigrate(storage: Storage | undefined, key: string): EngineSnapshot | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    return migrateSnapshot(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}
