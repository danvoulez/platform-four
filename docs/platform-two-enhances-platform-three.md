# How platform-two can enhance platform-three

An architectural read of both codebases, and a staged plan for combining them.

Source material: `Platform-three.zip` (the Eon-Forge Workbench, ~100 files) and
`platform-two-main.zip` (Powerfarm, 28 packages).

---

## 1. The asymmetry

The two codebases are almost perfect complements, and not in the way the file counts suggest.

| | platform-three | platform-two |
|---|---|---|
| Identity | Eon-Forge Workbench — graph-first analyst surface | Powerfarm — programmable agent environment |
| Own code | ~3,755 lines (+6,083 vendored shadcn) | ~484,000 lines across 28 packages |
| Frontend stack | React 19, Tailwind v3, shadcn/Radix, zustand, Vite 7 | React 19, Tailwind v4, Cloudflare Kumo, TanStack Router, Cap'n Web |
| Persistence | `localStorage` (33 lines) | Durable Objects, git-backed store, typed-storage |
| Network calls | **zero** | Cap'n Web RPC over WebSocket |
| `async`/`await` in app code | **zero** | throughout |
| Tests | **0 files** | **202 files** + workerd integration harness |
| External capability | none | 16 gatekeepers (GitHub, Linear, Notion, Slack, Google, Supabase, MCP…) |

platform-three is a **surface without a substrate**. platform-two is a **substrate with a
conventional surface**. The user's instinct — that platform-three has the better visual — is
correct, and it points at the right merge direction: keep platform-three's head, give it
platform-two's body.

### The stale-README problem

Worth stating plainly, because it shapes the plan. platform-three's `README.md` describes an
architecture the shipped code does not contain:

- a FastAPI control plane at `:8787` proxying a LangGraph Agent Server
- "durable human review controls: approve / revise / reject"
- "Create Sentinel" for continuous monitoring and change detection
- governed sources, DLP, connector policy, model budget, source SLA
- `Run from here` via Agent Server `command.goto`

None of it is wired. `grep -rn "fetch\|VITE_\|async " src/` outside `components/ui/` returns
nothing. The `.env.example` defines `VITE_EON_API_URL`, and no code reads it. The README even
warns "Do not expose `LANGSMITH_API_KEY` through Vite" — sound advice with nothing to enforce it,
because there is no server.

This is not a criticism of the prototype. It is the actual finding: **platform-three has already
specified the system it wants to be, and platform-two is a working implementation of most of that
specification.**

---

## 2. platform-three already reinvented platform-two's kernel

The strongest signal that these two belong together is that platform-three's domain layer,
written independently and entirely in the browser, arrived at platform-two's core concepts in
miniature.

| platform-three (`src/domain/process/`) | platform-two (`packages/workshop-shared/src/api.ts`) |
|---|---|
| `MutatingCommand.expectedVersion` → `version_conflict` | `ChatMergePoint { generation, revision, nextSequence, transactionRevision }` + compare-and-swap merge |
| `mutationKey` with idempotent replay (`findReplay`) | `CodeChangeSubmission { clientId, seq }`; `idempotencyKey` on runs and events |
| `ProjectEvent { actor, reason, sequence, turnSequence }` | `ActionLogEntry` + durable chat history + audit retention |
| `ALLOWED_STATUS_TRANSITIONS` state machine | `OperatorPolicy` + `provisioning-policy.ts` |
| `EngineSnapshot` → `localStorage` | Durable Object storage + `git-store.ts` |
| `graphOperationBatchSchema` (max 20 ops) | `MAX_CODE_CHANGE_SIZE`, `validateCodeChangeSchema` |
| README: "approve / revise / reject" | `ActionState = "pending" \| "approved" \| "rejected"`, `resolvedBy`, `autoApproved` |
| README: "Create Sentinel" | `WorkspaceOperator`: event → run → policy → apply |
| README: model budget, DLP, connector policy | `AutonomousRunLimits`, `OperatorPolicy`, gatekeeper capability scoping |

`ProjectEngine` in `engine.ts` is a faithful single-tab model of a transactional kernel. Every
mutation takes an `expectedVersion`, carries a human-readable `reason`, appends an immutable
event, and returns a fresh projection. That is the right shape. It is simply running in one
browser tab against a `Map`, where `expectedVersion` can never actually conflict and
`mutationKey` can never actually replay.

The enhancement is therefore not "port features across." It is **give the existing semantics a
real substrate**, which is largely a matter of moving one already-portable module.

---

## 3. What to take, in order

Ordered by value per unit of risk. Each stage leaves a working app.

### Stage 0 — Extract the engine into a shared package

`src/domain/process/*` (1,665 lines) is pure TypeScript and zod. Its only platform dependencies
are `crypto.randomUUID()` and `TextEncoder`, both available in workerd. It has no React, no DOM,
no imports from the UI layer.

Lift it to `packages/process-core/`, consumed by both the browser and a Durable Object. This is
the highest-leverage move because the code is *already* written to be portable — someone drew
that boundary deliberately, and nothing has crossed it yet.

Adopt platform-two's rule from `REVIEW.md` at the same time: every exported member of a shared
contract gets a doc comment. `contracts.ts` is already close.

### Stage 1 — Replace `localStorage` with a durable substrate

`persistence.ts` is 33 lines with a `try/catch` that silently drops writes when storage is full.
Swap it for platform-two's `typed-storage` over a Durable Object, keeping `localStorage` as an
offline read cache rather than the source of truth.

Engine semantics do not change — which is the point. `expectedVersion` stops being a formality
and becomes a genuine CAS across clients. `mutationKey` stops being decorative and starts
absorbing real retries.

### Stage 2 — Make the store async, and add live updates

**This is the real cost of the whole merge, and it should be paid before any feature work.**

platform-three's zustand store is synchronous end to end: `mutateGraph` returns a `MutationResult`
and the UI reads it in the same tick. Every one of those call sites in `state/workspace.ts` (722
lines) needs an in-flight state, an optimistic local echo, and a conflict path. There is no way
around it, and doing it after the visual work means redoing the visual work.

Then adopt platform-two's subscriber pattern, which is well-designed and easy to copy — the
`entry() / removed() / ready()` shape from `WorkpiecesSubscriber`, `ActionsSubscriber`, and
`PresenceSubscriber`. Note `AiChatSubscriber.streamGeneration()`: an opaque server-instance token
that tells a reconnecting client whether to discard provisional stream state. That detail is
earned experience; take it as-is.

`ActivityView` becomes a real multi-actor event feed instead of a local log, with no visual change.

### Stage 3 — Put a real agent behind the fixture copilot

`ChatView.tsx` already renders a **typed card union** (`ChatCard`: `status | next | blockers |
history | node | confirm | projects`) rather than markdown blobs. platform-two streams typed
events (`AiChatStreamEvent`, `AiToolCall`). These fit together directly: map the stream onto the
existing card renderer and the visual language survives intact while the content becomes real.

Same for `TerminalView`. platform-three hand-rolls a command parser in `submitTerminal` —
`projects`, `open <n>`, `new <title>`, `status`, `add`, `link`, `tombstone`, `tag`, `history`.
platform-two has `SlashCommandProvider` / `SlashCommandDescriptor`, a real protocol where
capabilities register their own commands. The ops terminal then reflects what is actually
connected instead of a hardcoded list.

### Stage 4 — Approval gates, rendered spatially

platform-three's README promises approve/revise/reject. platform-two has it built: `ActionLogEntry`
with `state`, `resolvedBy`, `autoApproved`, plus `useAutoApproval` / `useResolveAction` /
`AutoApproveConfirmDialog` and the `ApprovalQueue` interface.

This is the stage where the combination is genuinely better than either parent. platform-two
renders pending actions as a list. platform-three has an amber `signal-amber` node treatment and
the `ContextTools` ring that follows selection. **A pending action as a live amber node on the
canvas, approved in place from the context ring, is a better approval surface than a list** — and
it needs no new visual vocabulary, only the existing one pointed at real data.

### Stage 5 — Sentinels are Operators

platform-three's hero offers two entry modes: "New Investigation" and "Create Sentinel." The
second is unimplemented. It is `WorkspaceOperator`, precisely:

```
event → matched operator → autonomous run → policy check → apply | approval | proposal-only
```

with `OperatorPolicy` (`denyExternalActions`, `denyNewBindings`, `maxFiles`, `maxGadgets`),
`AutonomousRunLimits` (duration, steps, tokens, cost in USD), `maxConcurrentRuns`,
`maxRunsPerHour`, `retentionDays`, and an 11-state run lifecycle including `stale` and
`cancelling`. Wire the hero's second button to `putOperator()`.

The `WorkspaceOperatorRun` lifecycle is also a natural fit for the canvas — a run is a graph,
and platform-three draws graphs better than platform-two does.

### Stage 6 — Real provenance through gatekeepers

platform-three's `InspectorView` shows "provenance and confidence" over fixture metadata.
platform-two has 16 capability-scoped gatekeepers. A node whose provenance is an actual Linear
issue or Notion page — reached through a narrow, revocable capability rather than ambient
credentials — is the difference between a demo and a tool.

Import the discipline along with the code. From `REVIEW.md`: `getGatekeeperClassFor()` is the
single chokepoint where disabled gatekeepers and resources are enforced before a capability is
minted; a gatekeeper must never assert its own ambience; the frontend is not a security boundary.

### Stage 7 — Tests

platform-three has zero. platform-two has 202 test files plus a harness worth copying wholesale:

- `harness.ts` boots real Workers under wrangler's `createTestHarness()`
- `rpc-client.ts` speaks the same Cap'n Web transport the browser uses
- `network-interceptor.ts` patches `globalThis.fetch`, passes loopback through, and **throws on
  anything a handler didn't match** — a test physically cannot reach the internet

That last property is the one to adopt first.

---

## 4. What not to do

**Do not merge the two frontends.** They disagree at every layer: Tailwind v3 vs v4, shadcn/Radix
vs Cloudflare Kumo, React Router vs TanStack Router, zustand vs RPC-stub hooks, lucide vs
Phosphor. Reconciling them would cost more than either is worth and would destroy the thing that
started this — platform-three's visual language.

The correct seam: take platform-two's **shared contracts and backend** (`workshop-shared` is
UI-free; `workshop-backend`, `typed-storage`, `router`, `error-reporting`, the gatekeepers), and
leave `workshop-frontend` where it is. `workshop-shared/src/api.ts` is 4,401 lines of documented
types with no UI dependency. That is the interface to build against.

**Do not ship real data onto the current canvas.** `GraphCanvas.tsx` positions nodes as
percentages inside a `viewBox="0 0 100 100"` SVG with `vectorEffect="non-scaling-stroke"`. It is
elegant at fixture scale (~10 nodes) and has no pan, no zoom, no drag, and no virtualization. A
real workspace will break it. Real layout is a prerequisite for real data, not a follow-up.

**Do not carry the README forward as written.** Close the gap in whichever direction is true at
each stage. Right now it documents a system that does not exist.

**Do not let `VITE_EON_BEARER_TOKEN` survive contact with a real backend.** platform-three's own
README says the frontend is not a security boundary; platform-two's auth config is deliberately
env-var driven in `auth/config.ts` and kept out of admin-writable settings so a compromised admin
session cannot change it. Take that arrangement rather than inventing one.

---

## 5. The exchange runs both ways

The question was one-directional, but the trade is not.

platform-two's `docs/operators.md` describes a genuinely novel primitive — durable, event-driven,
policy-gated autonomous engineering — presented through a conventional dashboard. platform-three's
spatial canvas, sparse mono metadata, floating dock, and selection-following context tools are a
better way to see a running Operator than a table of runs. The `night`/`signal` palette
(`#0b0b0d` ground, four semantic signal colors) and the `.mj-panel` glass surface are a coherent
design system in about 60 lines of CSS.

The honest summary: **platform-two knows what it is and cannot show it; platform-three knows how
to show it and has not built it yet.**

---

## 6. Suggested first commit

If only one stage gets done, do Stage 0 plus the front half of Stage 2: extract
`domain/process/*` into a runtime-neutral package and convert the store's command surface to
async against a local in-process adapter.

That yields no user-visible change and no new dependency, and it is the step every later stage
is blocked on.
