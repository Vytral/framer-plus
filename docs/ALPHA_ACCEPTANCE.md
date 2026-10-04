# Alpha acceptance — v0.1.0-alpha.1

Reconciled 2026-10-04. This document records current acceptance; the phase documents retain detailed implementation evidence and historical runs. A passed automated test is not a passed native editor test. Experimental alpha software, not a stable or full-fidelity release.

## Product coverage

| Capability | Implemented subset | Automated evidence | Native evidence / remaining acceptance |
| --- | --- | --- | --- |
| Project/session/branch | Live status probes, project identity, active canvas, active branch | Transport, missing/ambiguous sessions, context tests | Oct 2: real project identified, Home active, branch main. Oct 4: protocol-4 editor reconnected; project, Home, nine pages and branch verified. |
| Pages/hierarchy | Web/design pages, paths, active flag, scoped IDs; bounded tree/cursors/depth boundaries | Page pagination, normalized relationships and traversal tests | Oct 2: nine web pages enumerated, Desktop and Hero inspected. Oct 4: all 314 API-reachable Home nodes read over five cursor pages, no remaining depth roots. Component-instance interiors are not expanded. |
| Text/layout/visuals | Exposed normalized sizing, stack properties, text preview/style and visuals; unknowns explicit | Normalization, bounds, capabilities and allowlisted patch tests | Oct 2: representative Desktop/Hero metadata/layout/visuals read. Oct 4: Hero inspected in Desktop, Tablet and Phone; exposed layout and replica identities verified. |
| Responsive | Real breakpoints, replica/original identities, effective supported values; explicit replica layout/visual writes | Phone-only fixture mutation verifies primary unchanged; wrong scope/reset rejection and uncertainty tests | Native Desktop flags exposed a real classification bug; fixed with regression tests. Oct 4: corrected primary/replica capabilities and effective responsive values verified; native writes not certified. |
| Components | Local definitions, identifier resolution, concrete variant frames, existing primitive controls | Instance/definition resolution and scoped patch tests | Oct 4: one instance resolved to its local definition, five primitive controls and five concrete variants. Writes remain untested. |
| Styles/assets | Color/text styles, compatible existing bindings; referenced images/SVG metadata | Binding and asset/limits fixtures | Oct 2: five color styles sampled with nextOffset. Oct 4: five color styles, five text styles and five referenced images sampled, with nextOffset. |
| CMS | Collections/ownership, bounded schemas/items, existing user-managed scalar patches | Type/required/fallback/ownership/stale revision fixtures | Oct 4: two user-managed collections, both schemas and one record from each inspected. Unsupported rich/image/date fields explicitly read-only. Native writes remain pending. |
| Reviewed plans | Up to ten distinct node/CMS resources, pages/views/context preview, instance/style/CMS scopes | Mixed five-target/two-page/Phone plan, approval, stale CMS preflight, unknown-stop/skipped outcomes | Oct 4: a real three-target Tablet/Phone/CMS plan returned pending, without approval/execution. No real portfolio write was performed. |
| Design IR / React | Schema-1 snapshots/IR, deterministic generation, diagnostics, explicit viewport ranges | Eight design tests, MCP integration, golden files and generated fixture build | Real representative full-page export fidelity/accessibility remains unverified. |
| Regeneration | Source mapping, same-project comparison, fresh-directory conflict handling | Compatible edits, collisions, tampering and symlink tests | Native design/code roundtrip not claimed. |

## Native acceptance ledger

The previously connected real portfolio was inspected read-only on **2026-10-02**, through the actual Framer+ MCP/stdio and plugin bridge. Project identity, Home active canvas, nine page paths, Desktop/Hero snapshots, sampled color styles and active branch were observed. User confirmation of Connected corroborated pairing, not every tool or mutation.

Desktop reported both `isVariant=true` and `isBreakpoint=true`. The prior component-variant restriction therefore incorrectly blocked valid page edits. The adapter now distinguishes those flags, while component-definition ancestry and real component variants remain protected. Fixtures use real breakpoint dual flags and regression tests cover both allowed primary and protected component cases.

On **2026-10-04**, an actual stdio MCP client listed **33 tools**, then the user re-paired the real editor using the new process credential. Status probes confirmed the session. Project, active Home, nine page paths and branch main were reverified. All **314 API-reachable Home nodes** were traversed across **five cursor pages** (127 stacks, 58 component instances, 50 text nodes, 63 frames, 15 SVG nodes and one page); the final page had no cursor or depth-continuation roots. This covers the API-reachable canvas hierarchy, not component-instance internals.

Desktop/Tablet/Phone widths were 1200/810/390 px. Representative Hero snapshots exposed correct primary/base versus replica/breakpoint write capabilities after the fix; Phone effective height/padding differed from Desktop and provenance remained explicitly unknown. One instance resolved to a local definition, with five primitive controls and five concrete variant frames. Both style categories and referenced images were sampled with pagination. Two CMS collections, their schemas and one representative record each were inspected without exposing content in repository evidence. Selection inspection also succeeded.

A cross-page limitation was observed: `/projects` and `/blog` page roots expose child IDs, and `/projects` breakpoint metadata is readable, but fresh `getNode` calls returned null for non-active-page breakpoint IDs. Their tree calls reported truncation with reason `changed`. Do not claim complete native cross-page hierarchy or mutation acceptance from fixture composition. Opening the page makes its nodes resolvable after the asynchronous canvas transition. No undocumented fallback or cached-write bypass was introduced.

Outstanding native checklist:

- [x] Identify project, active Home page and all nine web pages — reverified Oct 4.
- [x] Traverse every API-reachable Home descendant — 314 nodes / five pages / no remaining continuation roots. Component interiors remain outside this graph.
- [x] Identify Desktop/Tablet/Phone and inspect Hero in each view after the fix.
- [x] Inspect one instance, its five controls and resolved definition/variants.
- [x] Inspect both style kinds and referenced images with continuation.
- [x] Inspect both available collections/schemas and one representative record each.
- [x] Prepare a real Tablet/Phone/CMS plan; returned pending, no approval/execution. Process restart revoked it.
- [x] Verify explicit navigation between Projects, Blog and Home, readable nodes after opening, and automatic plan revocation when leaving Blog.
- [ ] On a disposable project with explicit authorization, execute and verify supported mutations, responsive isolation, mixed plans and failure/recovery cases.

The user's real portfolio has not been edited for this acceptance run. No arbitrary visible changes, publication, deletion or rollback occurred. Native write testing requires a disposable project or explicit approval of a concrete plan. Approval of connectivity is not authorization to execute a portfolio plan.

## Automated and build acceptance

On 2026-10-04, frozen dependency installation and `pnpm check` passed: Biome formatting/lint, strict source/test TypeScript, **72 tests** (**47 plugin + 17 MCP + 8 design**) and all five workspace package builds. Plugin Vite and MCP TypeScript production builds passed. `pnpm verify:export` passed generated React fixture TypeScript and production Vite build using pinned existing dependencies.

Coverage includes actual MCP SDK/WebSocket transport with fixture native adapters; that verifies the transport and semantic contract, not Framer's native mutation behavior. Native-boundary call-shape fixtures also exercise the public SDK adapter. New mixed-resource tests specifically cover cross-page/view composition, stale CMS preflight before any write and verified/unknown/skipped partial results with no replay.

Archive generation/integrity, clean archive installation and publication are recorded in [release verification](RELEASE_VERIFICATION.md). Do not infer them from a build check alone.

## Agent surface review

The 33 tools comprise status, 27 editor tools and five design/artifact tools. Descriptions explain supported scope and unsupported reset operations; parameter descriptions explain references, revisions, pages/breakpoints, pagination and limits. Discovery starts with status → project/branch → pages → hierarchy/resources → plan. Parents/children are included in node responses rather than redundant tools.

Identifiers are session-scoped and must be refreshed on reconnect. Node/CMS fingerprints are best-effort observations, not native compare-and-set. Live lists use nextOffset and can shift under collaborator edits; SDK enumeration may fetch all native items before paging the response. Tree pages use opaque cursors and expose depth-boundary roots. Responses and artifact inspection have byte/item caps. Context changes, stale revisions, missing permissions and unsupported mutations produce explicit errors; uncertain writes must never be automatically retried.

Multi-page and multi-view plans are first-class operation arrays. Native non-active-page lookup failed for observed breakpoint IDs; cross-page execution is verified only with fixtures and must not be promised for every real project. A request to fix Tablet/Phone while preserving Desktop is representable for exposed layout/visual properties on existing replicas; it cannot claim complete responsiveness where typography/inheritance information is unavailable. A CMS article patch and card layout patch can share a plan, but finding the associated card remains an inspection task. Instance-control/style links currently require compatible base nodes; responsive instance controls are not supported.

## Limits: API versus implementation

**Public API/adapter limits:** per-property responsive override flags/source/reset; isolated effective node font size and writes; selected instance variant axes/per-control override provenance/reset; incomplete component control constraints; no native atomic transaction/compare-and-set; no guarantee against collaborator changes during a call.

**Alpha implementation gaps:** create/move/delete; asset uploads/insertion/replacement or complete unused asset catalog; shared style-definition editing; CMS create/delete/schema/localization/complex fields; branch creation/switch/merge; Server API/remote service. Public primitives exist for several of these; absence is not an API prohibition.

**Acceptance gaps:** full current native inspection checklist, all native writes and recovery matrix, large-site/real-export/accessibility review, newcomer onboarding, Marketplace distribution and stable compatibility/ownership policy. See [remaining 1.0 gates](RELEASE.md).

## Sequential pages and independent views

The official public SDK includes navigateTo. `open_page` now exposes explicit web-page navigation with expected active-canvas preconditions, project/branch checks and readback; it serializes with planning/writes and revokes old approvals/cursors. Reinspect the newly opened page and prepare a fresh page-local plan. No hidden navigation occurs during a reviewed cross-page batch. Native testing confirmed navigateTo visibly opens Projects (user confirmation), and a later get_project/get_node resolves the new canvas and its Desktop. The immediate verification initially rejected the transition because Framer updates canvas state after navigateTo resolves. A bounded four-second wait now covers that lag; automated delayed-context regression verifies it. Native verification then passed Projects → Blog and Blog → Home with explicit previous/new canvas readback. Blog hierarchy and Desktop became readable, a page-local plan returned pending, and navigation back to Home changed that plan to rejected automatically. No design/CMS writes occurred.

Independent responsive nodes are not automatically linked. Current text tools edit base nodes only; they do not safely synchronize arbitrary disconnected Phone/Desktop structures. Correspondence discovery, reviewed independent-view text synchronization and animation/effect coverage remain explicit stable-product work. Supported layout/visual editing does not imply access to every Framer property.
