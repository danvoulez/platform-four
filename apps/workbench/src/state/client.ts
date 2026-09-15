import {
  LocalPowerfarmClient,
  browserSnapshotStore,
  type PowerfarmClient,
} from '@powerfarm/client'

/**
 * Chooses the substrate the Workbench talks to.
 *
 * Local mode is the default and is honest about being local: it runs the real Project engine over
 * browser storage with fixture data, and declines software, Changes and Runs rather than
 * simulating them.
 *
 * `VITE_POWERFARM_LATENCY_MS` injects artificial round-trip latency into local mode. It exists so
 * the asynchronous paths are exercised during ordinary development — a local adapter that answers
 * instantly hides every missing pending state.
 *
 * Note what is *not* here: no bearer token, no API key, no credential of any kind. The browser is
 * not a security boundary and nothing that confers authority belongs in a `VITE_` variable. When
 * the connected adapter lands, it authenticates through the session the server already holds.
 */
export function createPowerfarmClient(): PowerfarmClient {
  const latencyMs = Number(import.meta.env.VITE_POWERFARM_LATENCY_MS ?? '0')

  return new LocalPowerfarmClient({
    latencyMs: Number.isFinite(latencyMs) && latencyMs > 0 ? latencyMs : 0,
    store: browserSnapshotStore({
      onWriteError: (error) => {
        // Local persistence failing is worth knowing about — it is the difference between a
        // workspace that survives a reload and one that does not.
        console.warn('[powerfarm] local workspace could not be saved', error)
      },
    }),
  })
}

/** The process-wide client. One substrate per Workbench session. */
export const powerfarm: PowerfarmClient = createPowerfarmClient()
