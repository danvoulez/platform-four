/**
 * @powerfarm/client — the seam between the Workbench and Powerfarm.
 *
 * The Workbench talks to Powerfarm concepts through this boundary and nothing else. It never
 * learns what a Durable Object, a Cap'n Web stub, an Overseer, a Gadget or a Gatekeeper is: those
 * are an adapter's business, and translating them into the Workbench's vocabulary is exactly what
 * an adapter is for.
 */
export * from './client'
export * from './errors'
export { LocalPowerfarmClient, browserSnapshotStore, memorySnapshotStore } from './local'
export type { LocalPowerfarmClientOptions, SnapshotStore } from './local'
