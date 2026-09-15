# Source map

What came from where, and what changed on the way in.

Platform Two (`powerfarm`, 28 packages) and Platform Three (`eon-forge-workbench`, ~100 files) are
reference material. Neither was modified; Platform Four is built in this repository.

## From Platform Three — the experience

| Platform Three | Platform Four | Change |
|---|---|---|
| `src/index.css`, `tailwind.config.js` | `apps/workbench/` (unchanged) | The `night` palette, `signal` colours and `.mj-panel` glass surface are the visual foundation. Kept verbatim. |
| `src/domain/process/*` | `packages/project-core/` | Extracted, renamed to Project vocabulary, made runtime-neutral, tested. |
| `domain/process/engine.ts` | `project-core/engine.ts` | Semantics preserved. **Fixed:** replay now precedes the version check (see architecture.md). |
| `domain/process/kinds.ts` | `project-core/kinds.ts` + `workbench/src/domain/icons.ts` | Split: the registry names icons as strings so core stays runtime-neutral; the app resolves them to components. |
| `domain/process/layout.ts` | `project-core/layout.ts` | Rewritten to emit world pixels with real spacing instead of normalised 0–100. Tested. |
| `domain/process/persistence.ts` | `powerfarm-client/local/storage.ts` | Moved behind the adapter. Write failures now report instead of being swallowed. |
| `state/workspace.ts` | `apps/workbench/src/state/workspace.ts` | Rewritten: async over the client boundary, explicit pending/conflict/failure state, reconciliation. |
| `state/layout.ts` | unchanged shape | Dock arrangement kept. Storage key renamed off the prototype; panel defaults to extended. |
| `components/GraphCanvas.tsx` | rewritten | Interaction concept preserved exactly; percentage SVG replaced with a world-coordinate canvas. |
| `components/views/ChatView.tsx` | adapted | The typed `ChatCard` union is preserved — it is why assistant output never had to become Markdown. Now driven by a real event stream. |
| `components/dock/*`, `boxes/*` | adapted | Dock, drag-to-rearrange, pop-out and size cycling kept. `CanvasBox` now controls the viewport instead of a decorative grid pitch. |
| `components/HeroOverlay.tsx` | adapted | Two entry modes kept; wording is Powerfarm's. |
| `README.md` | discarded | Described a FastAPI/LangGraph architecture the code did not contain. See "README versus code" below. |

## From Platform Two — the machinery

| Platform Two | Platform Four | Status |
|---|---|---|
| `workshop-shared/src/api.ts` — subscriber convention | `client.ts` `ProjectSubscriber` | Adopted: catch-up burst, `ready()` boundary, then live deltas. |
| `AiChatSubscriber.streamGeneration()` | `AssistantEvent.final.sequence` | Adopted in concept: a durable sequence lets a reconnecting client replace provisional stream content instead of appending it twice. |
| `AiChatStreamEvent`, `AiToolCall` | `AssistantEvent` | Translated in `platform-two/mapping.ts`. Tested. |
| `ActionLogEntry`, `ActionState` | `ChangeState` | Translated. `proposed` and `applied` kept far apart. Tested. |
| `CodeChange`, `FileChange` | `ChangedFile[]` | Translated. Tested. |
| `ChatMergePoint`, `MergeChangesAtPointResult` | `PlatformTwoTransport.mergeAtPoint` | Seam defined. A lost race stays a value, not a throw. |
| `WorkspaceOperatorRunStatus` (11 states) | `RunStatus` (5) | Translated, exhaustively tested. |
| `WorkpieceSummary` | `RepositorySummary` | Translated. A provisional gadget is declined rather than given a fake revision. |
| Gatekeeper account/vendor types | `Connection`, `Capability` | Translated. The word Gatekeeper does not cross the boundary. |
| `integration-tests/network-interceptor.ts` | not yet ported | The property to copy: unmatched egress **throws**, so a test cannot reach the internet. |
| `workshop-frontend` | **not used** | Incompatible stack by design (Tailwind v4, Kumo, TanStack Router, Cap'n Web hooks). Read as behavioural documentation only. |

## Vocabulary translation

Platform Two's implementation words stop at the adapter.

| Platform Two | Platform Four |
|---|---|
| Gadget / Workpiece | Software / Repository |
| Gatekeeper | Connection (and its Capabilities) |
| ChangeSet / code change submission | Change |
| Overseer | — (never surfaced) |
| Operator | — (Sentinel/Run, when Continuity lands) |
| Blueprint | — (not in v0.1) |

## README versus code

Both sources ship documentation that outruns their code. Where they disagreed, the running code
won.

**Platform Three.** Its README describes a FastAPI control plane at `:8787` proxying a LangGraph
Agent Server, "durable human review controls: approve / revise / reject", a "Create Sentinel"
monitoring mode, governed sources, DLP, connector policy and model budgets. None of it exists in
the shipped code: there is no `fetch`, no `async`, no network call anywhere outside vendored
shadcn components, and `.env.example` defines `VITE_EON_API_URL`, which nothing reads. Persistence
is 33 lines of `localStorage`. Platform Four does not carry these claims forward — `docs/status.md`
states only what is true.

**Platform Two.** Its README and `llms.txt` describe the CLI, Operators and transaction engine
accurately as far as could be verified from source. `docs/runtime-portability.md` is candid that
Cloudflare is the only working runtime adapter and that local and Vercel adapters are planned, not
shipped — noted here so Platform Four does not assume portability it would not get.

**One naming artefact carried in and corrected.** Platform Three's projection selector was tagged
`process_field` while it selected *Project* fields. Renamed to `project_field`, with a migration
for stored snapshots.
