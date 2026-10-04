# Phases 2–4: implementation and evidence

> Historical phase evidence is retained below. For the reconciled protocol-4 alpha, dated native observations, current test counts and unmet acceptance gates, see [Alpha acceptance](ALPHA_ACCEPTANCE.md). Earlier protocol versions/counts describe their original verification runs.


## Status

Phase 2 inspection and Phase 3 supported mutation paths are implemented.
Phase 4 implements breakpoint inspection and explicit replica layout/visual
overrides. Its original font-size/inheritance/removal acceptance scenario is
blocked by the public Plugin API; it is not declared complete.

The latest automated verification passes lint, source/test typechecks, 39 tests
and production builds. Tests include a real local WebSocket transport and the
MCP SDK client, plugin client and editor adapter together. Native editor operations
use fixtures; they do not certify actual Framer mutation behavior. The prior
protocol-1 editor connection was confirmed by the user. Protocol-2 real-editor
reads and writes remain pending reconnection and runtime validation.

## Research gate

The adapter is based on the installed `@framer/plugin` 5.1.0 declarations and
the official [node documentation](https://www.framer.com/developers/nodes),
[API reference](https://www.framer.com/developers/reference), and
[changelog](https://www.framer.com/developers/changelog).

| Concern | Evidence and resulting contract |
| --- | --- |
| Project | `getProjectInfo` provides a hashed ID and name; canvas root is separate. |
| Breakpoints | Actual page children expose `isBreakpoint`, `isPrimaryBreakpoint` and `inheritsFromId`. Suggestions are not existing breakpoint frames. |
| Replicas | `isReplica` and `originalId` identify responsive copies. Only concrete replica IDs are accepted as write targets. |
| Effective values | Exposed attributes can be read. CSS dimensions preserve their original sizing intent. Shared text-style sizes are not effective node font sizes. |
| Inheritance | Per-property override flags/source are unavailable. Replica sources and override status remain unknown, even when values equal the primary. |
| Local overrides | Exposed layout/visual attributes can be written on a replica. The primary is compared before/after; equal effective values cause no native write. |
| Removal | No documented per-property reset API. Clear returns `BREAKPOINT_WRITE_UNSUPPORTED`; copying a primary value would not restore inheritance. |
| Typography | No isolated node `fontSize` mutation. Shared text-style changes would have broader scope and are not offered here. |

Runtime confirmation of native replica semantics remains necessary before
claiming the portfolio acceptance scenario. No undocumented editor state or
Unframer assumptions are used.

## Inspection

Shared domain types live in `packages/core`; strict input/result schemas and
typed RPC live in `packages/protocol`. Native Framer objects stay behind the
plugin API boundary. Unknown node classes retain identity and warnings.

Node references are session scoped. Snapshots expose supported layout, visual
and text-preview data, relationships, capabilities and a best-effort revision.
Selection summaries avoid loading full text. Tree traversal is breadth-first,
bounded by depth, node count, serialized payload, frontier and cursor lifetime.
Cursors are single-use, tied to the active canvas and traversal parameters.
Depth-boundary root suggestions are capped at 200 and by payload budget.
Pages are live observations; concurrent changes can cause omissions and warnings.

## Mutation

Separate mutation schemas allow names, supported dimensions, gap, padding,
alignment, opacity, literal background color and isolated plain-text replacement.
They reject arbitrary SDK methods and unknown properties. Plain-text replacement
can remove rich formatting and cannot be combined with other changes.

Base scope rejects replicas, non-primary breakpoint descendants, locked ancestry,
components and variants. Native permissions are checked at execution. Writes are
serialized, checked against optional revision preconditions and re-read before
execution. A single native operation is followed by normalized read-back.

Responsive writes require explicit replica and non-primary breakpoint references,
resolve the original within the same page, and verify the primary after writing.
Unexpected read-back or failures after a native side effect produce
`MUTATION_RESULT_UNKNOWN`, non-retryable. There is no transactional rollback
claim. Expired or cancelled queued writes do not start, and transport loss never
causes automatic mutation replay. Sanitized mutation outcome logs use stderr.

## Verification coverage and remaining work

Tests cover SDK-object normalization, sizing semantics, unknown nodes, compact
selection, pagination and payload limits, cross-session references, malformed
results, capability and permission checks, preconditions, no-op writes, base
mutations, isolated text replacement, replica targeting, unchanged primary and
sibling fixture nodes, unsupported clear/font writes, cancellation and uncertain
outcomes. Existing authentication, origin, heartbeat and reconnect tests remain.

Remaining runtime checks: protocol-2 inspection against the real project; native
base mutation/read-back; a real Desktop/Tablet/Phone layout override and unchanged
primary/sibling confirmation. Complete override-source/removal and font-size
acceptance require new officially supported APIs. Components, CMS, batch writes
and export remain outside these phases.

## Alpha reconciliation update (2026-10-04)

`get_pages` now enumerates web/design pages with active flags, paths, scoped IDs and bounded live pagination. Nine real web pages were read on 2026-10-02. Desktop was observed with both `isVariant=true` and `isBreakpoint=true`; treating all variants as component variants incorrectly disabled valid page edits. The adapter now distinguishes breakpoint frames from component variants while retaining ComponentNode ancestry, lock, replica and non-primary base-write restrictions. Fixtures reproduce those dual flags; regression tests also protect actual component variants and definitions. The fix is automated-verified; fresh native mutation acceptance is pending.

The whole-Home traversal and revised responsive-write checks must not be certified from those partial node reads alone. Override provenance/reset and isolated font-size writes remain API-limited. Create/move/delete are absent implementation scope, despite available SDK primitives.

Current native reads on Oct 4 traversed 314 API-reachable Home nodes over five cursor pages and inspected all three Hero views. Non-active page breakpoint IDs were exposed by page-child reads but returned null from getNode, causing explicit tree truncation. `open_page` now provides an official, explicit navigateTo workflow with active-canvas preconditions, project/branch verification and cursor/approval invalidation. Automated tests cover those guarantees; native navigation results are tracked in ALPHA_ACCEPTANCE.md. Independent-view content matching/synchronization and animation coverage remain implementation gaps.
