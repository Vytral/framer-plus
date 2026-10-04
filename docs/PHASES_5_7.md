# Phases 5–7: implementation and validation

> Historical phase evidence is retained below. For the reconciled protocol-4 alpha, dated native observations, current test counts and unmet acceptance gates, see [Alpha acceptance](ALPHA_ACCEPTANCE.md). Earlier protocol versions/counts describe their original verification runs.


## Status and API evidence

The supported component, project-resource and complex-change workflows are
implemented in protocol version 3. Full phase acceptance inside a real Framer
editor remains unverified. Variant axes/selected variant identity and override
reset are explicitly unavailable in this public adapter; Phase 5's complete
variant/reset acceptance is not declared achieved.

Research uses the installed `@framer/plugin` 5.1.0 declarations and official
[component guide](https://www.framer.com/developers/plugins-with-components),
[CMS guide](https://www.framer.com/developers/cms),
[node guide](https://www.framer.com/developers/nodes), and
[API reference](https://www.framer.com/developers/reference).
The declarations explicitly document merging provided node attributes, updating
instance controls and patching supplied top-level CMS fields. SDK types expose
active branch identity, style references and collection ownership/permissions.
No internal agent APIs, undocumented fields or click automation are used.

## Phase 5: components and instances

`get_components` lists normalized definitions. `get_component` distinguishes a
concrete definition/instance and resolves identifiers against local definitions.
Missing/external definitions remain unresolved; multiple matches are ambiguous.
Definition children expose variant frames, primary flags, gestures and inheritance
IDs. These are not invented selected variant axes on an instance.

Instance controls expose bounded primitive values, availability and write support.
Bindings, variable objects, events, slots and complex values remain read-only.
Per-control override provenance stays unknown. `update_instance` requires explicit
instance scope and a component revision, accepts only existing primitive controls
of the same value type, and sends only requested keys to native `controls`.
It revalidates permissions/context, reads back the instance, and checks unchanged
exposed primitive controls. It never writes a definition or sibling instance.
Native constraints not exposed by public control metadata cannot be prevalidated;
read-back mismatches are uncertain outcomes, not successful edits.

Locked ancestry, variants, definition descendants, replicas and non-primary
breakpoint contexts reject instance edits. Clear-instance-override returns
`OVERRIDE_CLEAR_UNSUPPORTED` because no public per-control reset API is exposed.

## Phase 6: styles, assets and CMS

Style lists expose existing light/dark color tokens and text presets, including
bounded preset breakpoints. `apply_style` binds existing IDs on compatible base
nodes, with revision/permission checks and binding-ID read-back. It never mutates
shared style definitions. Node snapshots retain literal-versus-style information.

Asset inspection deduplicates referenced background images and caps consumer
references. SVG inspection exposes concrete SVG node references and byte lengths,
without sending raw SVG content. This is not a complete unused-asset catalog.
Upload, insertion/replacement and token-definition edits remain later work.

CMS tools expose collection ownership, field types/required flags/fallback IDs,
item slug/draft, bounded scalar data and revisions. Complex or oversized values
are marked unavailable or truncated. Writes patch supplied string, number and
boolean field IDs on existing user-managed collections. Field type, required
strings, fallback bindings, ownership, current native permissions and revisions
are checked before writing. Read-back checks supplied values. Arrays, references,
rich content, schema edits, creation/deletion and localization writes are excluded.
Unrequested top-level fields, slug and draft are not sent to the native setter.

All resource responses are bounded by item and payload budgets. `nextOffset`
continues a live list; concurrent reorder can create duplicates or omissions.
The SDK itself may fetch complete lists before response pagination. No cursor
snapshot or streaming-native-resource guarantee is claimed.

## Phase 7: plans, approval, context and audit

`plan_changes` dry-runs up to ten distinct base/breakpoint node operations with
mandatory revisions, concrete scopes and explicit breakpoint IDs. The returned
immutable plan includes current/requested values, project/branch context and
five-minute expiry. At most eight live plans and 32 retained plans exist per
adapter. User decisions happen locally in the plugin; there is no MCP approval
method. Approval alone performs no edit. Disconnection revokes live approvals.

`execute_change_plan` uses that exact approved plan. It checks project/branch and
all node preconditions before the first write, then rechecks context and each
operation during sequential execution. Duplicate targets reject. Approved plans
are consumed before writing and cannot replay after completion/partial failure.
There is no transaction: execution stops after the first failed/uncertain result
and reports verified, failed and skipped entries. It never blindly retries or
attempts rollback that could overwrite intervening user edits.

Revision fingerprints include project/branch context, so equal-value nodes/items
on another branch cannot reuse revisions. Native compare-and-set is unavailable:
checks are best effort and a branch change during a native call can produce
`MUTATION_RESULT_UNKNOWN`. Branch tools only inspect active identity; they never
create, switch, merge or publish. Destructive operations are absent from this
surface. Batches currently compose existing node base/breakpoint mutations,
not CMS or component-control operations.

`get_audit_log` reads the latest 100 session-memory operation outcomes and approval
decisions, with timestamps, codes and optional opaque plan IDs. It excludes design
content, node IDs and credentials. This is bounded development history, not a
persistent compliance log. MCP mutation summaries continue using stderr.

## Validation

`pnpm check` passed on 2026-10-02: lint, source/test TypeScript, 56 tests
(40 plugin + 16 MCP), and production builds. `git diff --check` also passed. Automated coverage includes existing transport tests plus component resolution,
primitive-control patches and unchanged fixture siblings/definitions, token binding,
CMS ownership/type/required/fallback/precondition checks, SVG/image metadata,
payload pagination, approval/expiry/revocation, cross-session/context rejection,
full-batch preflight and stop-on-error partial outcomes. MCP SDK clients exercise
new tools through real local WebSocket connections into the plugin adapter.
Native-boundary fixtures verify documented SDK call shapes and style/CMS patches.
Server-rendered review tests check exact escaped changes and approval controls.

These are fixtures, transport tests and rendering tests. They do not certify
native mutations, visual layout, keyboard interaction or branch/CMS permissions
inside Framer. Runtime acceptance still needs a reconnected protocol-3 editor,
actual component/style/CMS inspection and controlled writes, plus a locally
approved batch with native read-back. Restart MCP and reconnect after upgrading.

## Alpha reconciliation update (2026-10-04)

Protocol 4 extends reviewed plans to up to ten distinct targets: base/breakpoint node changes, primitive instance controls, existing style links and scalar CMS records. CMS targets carry collection/item IDs, not invented nodes. Preview entries carry actual page/breakpoint context for node targets. Existing permission, context, revision, approval/expiry and verification guards are reused by both direct and planned operations. All resources preflight before the first write; unknown/failed outcomes stop later writes and cannot replay the plan.

Four new tests verify page discovery/pagination, a mixed five-target plan spanning two pages and Phone plus component/style/CMS operations, stale CMS rejection before any write, and a verified/unknown/skipped partial result. The mixed-plan preparation and execution are fixture evidence, not native acceptance. Native controls/style/CMS reads recorded earlier do not certify write permissions or mutation behavior.

On Oct 4, native reads verified an instance/definition/controls, both style categories, referenced images, both CMS collections/schemas and representative records. A real three-target plan (Tablet layout, Phone layout and one scalar CMS field) was prepared and returned pending; it was never approved or executed. The process restart revoked that pending session. Cross-page execution remains fixture-only evidence; explicit navigation supports separate fresh per-page plans.
