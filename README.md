# Platform Four — Powerfarm Workbench

A workspace where a person and machine intelligence understand projects together: see the current
state, ask for work, review what is proposed, approve what should happen, and keep a durable record
of why things are the way they are.

Platform Four combines two prior implementations. The experience comes from **Platform Three** —
its spatial canvas, docking model, inspector and visual language. The machinery comes from
**Platform Two** — durable workspaces, agents, transactional review and apply, capabilities. The
seam between them is one typed client boundary.

## Status

**v0.1, local mode.** The Project domain, client boundary, async reconciliation and canvas are
built and tested. The connected adapter's translation layer is complete and tested; its transport
to a running Platform Two deployment is not yet implemented, so the Workbench currently runs
against a local in-process substrate with fixture data — and says so, in the status strip, at all
times.

Nothing in this repository fakes a surface it cannot back. Software, Changes and Runs are refused
in local mode rather than simulated.

See [`docs/status.md`](docs/status.md) for the honest breakdown.

## Run it

```sh
pnpm install
pnpm dev            # http://localhost:3000
```

```sh
pnpm test           # 124 tests
pnpm build
```

To exercise the asynchronous paths against artificial latency:

```sh
VITE_POWERFARM_LATENCY_MS=250 pnpm dev
```

## Layout

```
apps/workbench          the Workbench — React, Tailwind, zustand
packages/project-core   the Project domain — runtime-neutral, no DOM, no React, no storage
packages/powerfarm-client
  local/                in-process adapter (real engine, browser storage, fixtures)
  platform-two/         connected adapter (translation done, transport pending)
```

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — layers, the client boundary, async and
  reconciliation, source of truth
- [`docs/source-map.md`](docs/source-map.md) — what came from where, and where the sources'
  READMEs disagreed with their code
- [`docs/status.md`](docs/status.md) — REAL / LOCAL / PROTOTYPE / FUTURE, and the v0.1 checklist
- [`docs/platform-two-enhances-platform-three.md`](docs/platform-two-enhances-platform-three.md) —
  the original analysis this repository acts on

## Two things worth knowing

**A Project Graph is not a Process.** This models the structure and memory of a project — briefs,
milestones, tasks, decisions, blockers. Powerfarm Continuity will use *Process* for a versioned
executable software graph and *Run* for one execution of a Process revision. They may share a
canvas one day; they do not share a schema.

**A model editing something is not reality changing.** Those are different events, and the
Workbench keeps them apart. A proposal waits for authority, and the substrate — never the
browser — performs the transition.
