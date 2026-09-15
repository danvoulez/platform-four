# Platform Four architecture

Platform Four is the Powerfarm Workbench: Platform Three's spatial interaction model over the
transactional machinery proven in Platform Two.

It is not Platform Two rendered with Platform Three CSS, and not Platform Three with a backend
bolted on. The experience comes from Platform Three; the substrate comes from Platform Two; the
seam between them is deliberate and narrow.

## Layers

```
apps/workbench                     UI — shell, graph, inspector, assistant, activity, board, ops
        │
        │  React + zustand. Knows Projects, Changes, Runs, Connections.
        │  Does NOT know: Durable Objects, Cap'n Web, Overseer, Gadget, Gatekeeper, Workpiece.
        ▼
@powerfarm/client                  Client boundary — one typed seam
        │
        ├── local/                 LocalPowerfarmClient — real engine, browser storage, fixtures
        └── platform-two/          Connected adapter — translation complete, transport pending
        │
        ▼
@powerfarm/project-core            Project domain — runtime-neutral, no DOM, no React, no storage
```

The rule that keeps this honest: **UI components never import the engine and never call a
substrate API.** They call the store; the store calls the client; the client is an adapter.

## The Project domain

`@powerfarm/project-core` is Platform Three's domain layer, lifted out of the React app. It
depends only on `zod`, `crypto.randomUUID()` and `TextEncoder`, so the same engine runs in the
browser, in a test, and in a durable server runtime. That property is what lets the source of
truth move to the server without rewriting the semantics.

It preserves what Platform Three got right: versioning with an expected-version compare-and-swap,
idempotent mutation keys, an append-only event log carrying actor, reason and sequence, declared
status transitions, bounded operation batches, projection schemas, and tombstones.

### Project Graph is not a Process

Platform Three stored this under `src/domain/process/`. That name is wrong for Powerfarm. What it
models — brief, milestone, task, decision, blocker, pending, next action, note, subsystem — is a
**Project Graph**: the structure and memory of a project.

Powerfarm Continuity will separately use **Process** to mean a versioned executable software
graph, and **Run** to mean one execution of a Process revision. Both may eventually be drawn on
the same canvas. They must not share a schema because both happen to be graphs.

The rename covers the `project_field` projection selector and the `create_project` /
`change_project_status` / `update_project_tags` event types. `migrate.ts` upgrades a stored
Platform Three snapshot rather than discarding it.

### Idempotency outranks staleness

Platform Three checked `expectedVersion` before the idempotency replay. That is the wrong order,
and it defeats the purpose of a mutation key:

```
client submits mutation K at v40  →  server applies it, project is now v41
response is lost in the network
client retries mutation K at v40  →  version check fires first → "conflict"
```

The caller cannot distinguish *my write landed* from *someone raced me* — which is exactly the
ambiguity the mutation key exists to resolve. Platform Four checks the replay first: if the key is
already recorded, the effect already happened, and the recorded outcome is returned regardless of
the expected version. Covered by `engine.test.ts`.

## The client boundary

One seam, split by cohesive capability rather than one god-interface:

| Client | Responsibility |
|---|---|
| `projects` | list, get, create, mutate, subscribe |
| `assistant` | conversations and a typed event stream |
| `software` | repositories, trees, files |
| `changes` | list, get, diff, approve, reject, apply |
| `activity` | what happened, in human terms |
| `runs` | run status |
| `capabilities` | Connections and what they are permitted to do |

Every `ProjectCommand` carries `expectedVersion` and `mutationKey` as **required** fields, so a
caller cannot quietly drop the two things that make a distributed write safe.

`PowerfarmClient.mode` is `'local' | 'connected'`, and the Workbench shows it. The difference is
not cosmetic: in local mode nothing is durable beyond the browser and the data is fixture data.

### Errors

Adapters map their substrate's failures onto a fixed vocabulary — `conflict`, `offline`,
`unauthenticated`, `unauthorized`, `validation`, `not_found`, `stale`, `backend` — so the UI can
tell a recoverable conflict from an authorization refusal without knowing what is underneath.
Anything unclassifiable becomes `backend` and keeps its detail in `cause` rather than being
swallowed.

## Async and reconciliation

Every mutation takes one path:

```
intent
  → pending operation registered (+ provisional echo where safe)
  → request
  → authoritative result
  → reconcile
  → pending cleared
```

A lost compare-and-swap race is not an error. The store refreshes to authoritative state, then
retries **once with the same mutation key** when the intent is still meaningful against the new
version. Reusing the key is what makes that retry safe: if the first attempt had in fact landed,
the substrate replays it instead of applying it twice.

Auto-retry is per-intent, not global:

| Intent | Auto-retry | Why |
|---|---|---|
| add node, link nodes, add/remove tag | yes | independent of what the other writer did |
| update node | no | two people editing one node is a real disagreement |
| tombstone node | no | the target may already be gone |
| change status | no | the transition that was legal may not be legal from the new status |

Non-retryable conflicts surface in the status strip with a refresh action, and the store has
already reconciled to authoritative state by the time the user sees it.

## Source of truth

The server is authoritative for Project mutations, software changes, approvals, runs, durable
conversations and institutional activity.

The browser holds cache, optimistic state, provisional streaming state, and **personal layout** —
dock arrangement, panel sizes, preset, canvas viewport and node positions. Those stay local by
design.

`Node A depends on node B` is Project truth. `Node A sits at x=412` is how one person arranged
their workspace. Dragging a node must never manufacture a Project mutation or burn a version, so
`state/canvas.ts` is a separate store from Project state.

## The canvas

Platform Three positioned nodes as percentages inside a fixed `viewBox="0 0 100 100"` SVG. Elegant
at fixture scale, unusable with real data: no pan, no zoom, no drag.

Platform Four uses a world-coordinate canvas with a CSS transform for the viewport. Edges share
the node layer's transform so they stay welded during pan and zoom. Pan, zoom-at-cursor, drag,
fit, focus, Escape and Tab-to-step are implemented directly rather than through a graph library,
because the alternative is spending the same effort stripping a library's visual defaults back
out.

`layoutGraph` in project-core seeds positions deterministically (layered by topological depth,
siblings centred), and never moves a node the user has placed.

## Projections, not second databases

The Board derives from Project state at read time. There is no separate authoritative task store,
and the same rule applies to every future view: one underlying Project state, many projections.
