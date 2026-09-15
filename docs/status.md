# Status

What is real, what is local, what is a prototype, and what is deliberately absent.

Updated: 2026-09-15. This file describes the code in this repository. It is not a roadmap, and
nothing below is written in the present tense unless it actually works.

## Legend

- **REAL** — integrated and backed by an actual durable substrate
- **LOCAL** — works against the local adapter (in-process engine, browser storage, fixture data)
- **PROTOTYPE** — interaction implemented, real substrate not connected
- **FUTURE** — intentionally not implemented

## Where things stand

| Capability | Status | Notes |
|---|---|---|
| Project domain (versioning, CAS, idempotency, events, projections, tombstones) | **REAL** | Runtime-neutral, 52 tests. Correct independent of substrate. |
| Snapshot migration from Platform Three | **REAL** | `migrate.ts`, tested. |
| Powerfarm client boundary | **REAL** | One typed seam; UI never reaches past it. |
| Local adapter | **LOCAL** | Real engine, browser storage, injectable latency, concurrent-writer simulator. |
| Async commands, pending state, reconciliation | **LOCAL** | Exercised under injected latency and forced version conflicts. |
| Conflict recovery | **LOCAL** | Auto-retry with the same mutation key for safe intents; human decision otherwise. |
| Project Graph canvas (pan, zoom, drag, fit, focus, keyboard) | **LOCAL** | World coordinates, personal layout persisted separately from Project truth. |
| Inspector (Project, node, provenance, relationships) | **LOCAL** | One adapting surface, not a route per type. |
| Board | **LOCAL** | Derived projection, no second store. |
| Activity | **LOCAL** | Synthesised from durable Project events. Machine detail kept underneath. |
| Ask Powerfarm | **LOCAL** | Answers from the Project graph only, and says so. No model call. |
| Ops terminal | **LOCAL** | Commands route through the same client boundary as the buttons. |
| Workspace presets, dock, pop-out | **LOCAL** | Ergonomics only; never change Project truth. |
| Platform Two translation layer | **PROTOTYPE** | `platform-two/mapping.ts`: complete and tested (35 tests) with no backend required. |
| Platform Two transport | **PROTOTYPE** | `PlatformTwoTransport` seam defined. No implementation. Constructing the connected client throws rather than serving plausible data. |
| Real repository / source tree / file reading | **FUTURE** | Needs the transport. The local adapter refuses rather than faking it. |
| Real agent, real proposed Change, diff, approve, apply | **FUTURE** | Needs the transport. |
| Runs, Connections, Capabilities | **FUTURE** | Contracts defined; no data. Local adapter returns empty. |
| Multi-user, presence, sharing, tenancy | **FUTURE** | Out of scope for v0.1 by design. |
| Antenna, Heartime, Continuity Processes | **FUTURE** | Integration points, not reimplemented here. |

## What blocks the connected mode

The remaining work is one implementation of `PlatformTwoTransport`. It needs things the Workbench
repository cannot provide on its own:

1. A running Platform Two deployment (Cloudflare Workers, Durable Objects, `wrangler`).
2. Authenticated sessions — Platform Two's auth is env-var driven and server-side by design, and
   no credential belongs in a `VITE_` variable.
3. A real workspace with at least one Gadget carrying a head commit.

The translation layer above that transport is already written and tested, so connecting it is
transport work rather than product work.

## v0.1 definition of done

From the brief. Checked items are true of this repository today.

- [x] Platform Three's visual quality or better
- [x] The `process`-named domain correctly renamed to Project
- [x] Project domain logic runtime-neutral and tested
- [x] UI data access passes through a typed client boundary
- [x] Real operations are asynchronous and reconcile correctly
- [x] Browser `localStorage` is not authoritative for real Project state (it is the local
      adapter's store; the connected adapter is the authority when wired)
- [x] The graph supports pan, zoom, stable selection and stable positions
- [x] Local fixture mode still exists for development
- [x] Automated tests cover the important transactional boundaries
- [x] Documentation describes reality rather than aspiration
- [ ] One real Project loads
- [ ] Its real repository/source can be inspected
- [ ] Ask Powerfarm uses a real model/agent backend
- [ ] The agent can inspect the active Project and its software
- [ ] The agent can produce a real proposed software Change
- [ ] Changed files and a diff can be inspected
- [ ] A consequential Change can require authoritative approval
- [ ] Approval/rejection occurs through the real substrate
- [ ] An approved Change can be safely applied
- [ ] Activity records the meaningful sequence
- [ ] Reload/reconnect retains durable truth

The unchecked items are the vertical slice, and all of them are downstream of the transport.

## Test coverage

```
packages/project-core     52 tests   engine, projection, migration, layout
packages/powerfarm-client 52 tests   local adapter, Platform Two translation
apps/workbench            20 tests   async store, reconciliation, conflict recovery
                         ───────
                         124 tests
```

Not yet covered, and known: network retry against a real transport, stream reconnect, approval
transitions, apply against a stale base. All need the transport to exist first. Platform Two's
`network-interceptor` pattern — unmatched egress throws — should be adopted when it does.
