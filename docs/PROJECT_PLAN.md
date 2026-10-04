# Framer+ — Project Plan

> **Status:** Living technical plan  
> **Project:** Framer+  
> **Repository:** `Vytral/framer-plus`  
> **License:** MIT  
> **Tagline:** *Let your agents play with your Framer designs.*

---


## Alpha reconciliation — 2026-10-04

The primary product is an AI agent understanding and safely operating on a real Framer project. Design IR and export build on the same semantic model; they are not the sole product goal.

This document retains the original roadmap and acceptance scenarios. A checked task below means the supported implementation exists (**I**), with automated verification (**A**) where indicated. It does **not** certify native write acceptance or the phase's full Definition of Done. **Partial** means only a subset exists; **API-limited** means unavailable public semantics; **Pending** means implementation or acceptance work remains. Phase evidence documents remain the detailed source of truth; [current alpha acceptance](ALPHA_ACCEPTANCE.md) distinguishes dated native observations from fixtures.

| Phases | Implemented/automated evidence | Native acceptance / remaining scope |
| --- | --- | --- |
| 0–1 | Workspace, authenticated loopback WSS, strict protocol 4, reconnect/timeouts and session routing | Real-editor pairing confirmed on Oct 2; current reconnection and recovery matrix remain separate checks. |
| 2–3 | Page discovery, bounded hierarchy, selection/layout/text/visual inspection; allowlisted base edits and readback | Real project, nine pages and 314-node Home traversal verified Oct 4; non-active-page lookup limits observed. Native write readback remains pending; create/move/delete absent. |
| 4 | Real breakpoint identities, effective exposed values, explicit replica layout/visual writes with primary verification | All three views and representative Hero replicas read Oct 4; override provenance/reset and node font-size scenario API-limited. Native responsive writes pending. |
| 5–7 | Component/style/CMS inspection, primitive instance controls, scalar CMS edits, mixed reviewed plans across pages/views/resources | Local definitions/controls have API limits. Mixed execution verified with fixtures; native writes pending approval. |
| 8 | Installation/contribution/protocol/architecture docs, CI and alpha artifact tooling | Public alpha publication tracked in release evidence; Marketplace/new-user onboarding not certified. |
| 9–10 | Versioned IR, deterministic React generation, golden fixtures and build checks | Explicit viewport ranges required; typography/complex components/real-page fidelity not certified. |
| 11 | Source mappings, comparison and conflict-aware regeneration | Selected scope only. No reverse engineering, native code-component authoring or remote adapter. |
| 12 | Alpha release preparation, compatibility/privacy/security guidance | Stable 1.0 is **not complete**; see RELEASE.md gates. |

An explicit `open_page` operation enables sequential page workflows without design edits, revoking old approvals/cursors and requiring fresh inspection. Native acceptance of navigation is tracked separately. Cross-page batches never silently switch pages.

Multi-node, multi-view and multi-page operations are explicit reviewed plans, up to ten distinct targets. Plans can combine base/replica layout changes, primitive instance controls, style links and CMS scalar records. Each target retains its revision and page/view context; preflight occurs before the first write and partial outcomes are reported without rollback. `get_pages` supplies cross-page references without editor navigation. A CMS/card association must be discovered by the agent; it is never fabricated.

Independent responsive views can contain divergent content. Automatic correspondence and safe text synchronization between independent views, animation/effect coverage, and broader positioning/visual edits remain implementation/research work; they are not completed by the existing layout abstraction.

Create/move/delete are supported by public SDK primitives but have no safe Framer+ alpha tools yet. They are implementation gaps, not API impossibilities. The original complete responsiveness and stable release acceptance scenarios remain unmet.

## 1. Purpose

Framer+ is an open-source agent interface for Framer.

Its first job is simple to describe: give AI agents structured, reliable and safe access to a real Framer project so they can inspect the project, understand the canvas, reason about responsive design and make intentional changes without flattening the project into HTML.

Its longer-term job is more ambitious: establish a semantic representation of a Framer design that agents can reason about and that can eventually be transformed into clean application code such as React.

Framer+ is **not** intended to be a DOM scraper, a raw HTML exporter, a collection of brittle editor automations or an MCP wrapper that blindly mirrors every Framer API method.

The project should provide an agent-oriented abstraction over Framer.

The distinction matters:

```text
Bad abstraction

Framer -> opaque serialized editor state -> agent guesses what it means

Framer+

Framer -> adapter -> normalized design model -> explicit agent tools
```

The system should preserve enough Framer semantics to understand what the designer built while removing irrelevant implementation details that make agent reasoning difficult.

---

## 2. Product vision

A user should eventually be able to open a Framer project and ask an agent:

- "Inspect this page and explain its structure."
- "Fix the mobile layout without changing desktop."
- "Make the tablet version consistent with the desktop design language."
- "Change this component everywhere it is used."
- "Find elements that overflow at the phone breakpoint."
- "Replace these hard-coded colors with project tokens."
- "Create a new section using the visual language already present in this project."
- "Tell me which properties are inherited and which are breakpoint overrides."
- "Turn this page into a clean React implementation."

The important property is that the agent works with **design intent and structure**, not merely rendered output.

---

## 3. Guiding principles

### 3.1 Structured over flattened

Never use generated HTML as the canonical representation of a Framer project.

HTML can become an optional debugging/export artifact later, but the agent-facing model should describe pages, nodes, components, variants, constraints, responsive behavior, styles, tokens, assets and interactions explicitly.

### 3.2 Semantic over API-shaped

The MCP surface should not simply expose hundreds of low-level Framer methods.

Prefer tools such as:

```text
get_page_tree
get_selection
inspect_node
get_responsive_state
update_node
set_breakpoint_override
```

over an API surface that forces an agent to reconstruct Framer concepts from implementation-specific calls.

### 3.3 Read before write

Inspection is the foundation of safe mutation.

Framer+ must become excellent at reading and describing a project before broad mutation capabilities are enabled.

### 3.4 Explicit writes

Mutations should identify:

- the target;
- the intended scope;
- the properties being changed;
- whether the change affects a primary value or an override;
- validation failures;
- the resulting state when practical.

### 3.5 Preserve inheritance

Responsive and component inheritance are core design semantics, not implementation noise.

Framer+ must avoid accidentally materializing overrides when a property should remain inherited.

### 3.6 Stable protocol, replaceable adapters

Framer APIs will evolve. The public Framer+ protocol should change much less frequently.

Framer-specific conversion belongs behind adapters.

### 3.7 Safe by default

An agent should not be able to destroy a project because it misunderstood one node.

Broad destructive operations should require explicit scope, validation and eventually transaction/branch support.

### 3.8 Useful to humans too

Tool responses should be inspectable by developers. Errors should explain what happened rather than exposing only internal exceptions.

### 3.9 Code export means maintainable code

Future code generation should optimize for recognizable application architecture, reusable components, semantic markup, design tokens and responsive CSS—not pixel-perfect piles of absolute positioning.

### 3.10 Do not prematurely generalize

The MVP should solve Framer well. A future generic design-tool protocol may emerge, but Framer+ should not be weakened by abstractions invented before real requirements exist.

---

## 4. Scope

### 4.1 MVP scope

The MVP proves that an external MCP client can reliably inspect and modify an open Framer project through Framer+.

It must support:

1. plugin startup;
2. plugin ↔ bridge connection;
3. MCP server startup;
4. agent ↔ MCP communication;
5. project/session metadata;
6. current editor selection;
7. node inspection;
8. bounded tree traversal;
9. stable Framer+ node references;
10. normalized layout/style information;
11. responsive/breakpoint inspection where the Framer API permits it;
12. a deliberately small mutation set;
13. protocol validation;
14. actionable errors;
15. connection/health state.

### 4.2 Explicit non-goals for the MVP

Do not block the MVP on:

- React export;
- Next.js export;
- arbitrary code generation;
- CMS synchronization;
- publishing sites;
- full Server API parity;
- marketplace submission;
- multiplayer agent coordination;
- arbitrary raw API execution;
- pixel-diff visual testing;
- a generic Figma/Webflow adapter;
- production cloud infrastructure.

Those are later phases.

---

## 5. Framer capabilities and architectural constraints

Framer provides two relevant extension surfaces.

### Plugin API

The Plugin API runs while Framer is open and can interact with the editor and canvas. This is the preferred path for editor-aware operations such as current selection and interactive canvas manipulation.

### Server API

The Server API enables server-side project operations without requiring an open editor. Framer explicitly positions it for automation and external integrations, including MCP-style workflows.

Framer+ should treat these as **two adapters into one domain**, not two separate products.

```text
                        +------------------+
                        |     AI Agent     |
                        +---------+--------+
                                  |
                                 MCP
                                  |
                        +---------v--------+
                        | Framer+ MCP App  |
                        +---------+--------+
                                  |
                           Framer+ Core
                                  |
                    +-------------+-------------+
                    |                           |
           +--------v--------+         +--------v--------+
           | Editor Adapter  |         | Server Adapter  |
           +--------+--------+         +--------+--------+
                    |                           |
             Plugin bridge               Framer Server API
                    |                           |
           +--------v--------+                  |
           | Framer Plugin   |                  |
           +--------+--------+                  |
                    |                           |
                    +-------------+-------------+
                                  |
                           Framer Project
```

The editor adapter is the first implementation target.

The server adapter should not be implemented until the editor path and domain model are stable enough to reveal what abstraction is actually useful.

---

## 6. Repository architecture

Target structure:

```text
framer-plus/
├── apps/
│   ├── plugin/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── bridge/
│   │   │   ├── framer/
│   │   │   └── ui/
│   │   ├── framer.json
│   │   └── package.json
│   │
│   └── mcp/
│       ├── src/
│       │   ├── server/
│       │   ├── tools/
│       │   ├── bridge/
│       │   └── session/
│       └── package.json
│
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── model/
│   │       ├── capabilities/
│   │       ├── mutations/
│   │       ├── errors/
│   │       └── index.ts
│   │
│   └── protocol/
│       └── src/
│           ├── messages/
│           ├── schemas/
│           ├── rpc/
│           └── index.ts
│
├── docs/
│   └── PROJECT_PLAN.md
│
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── LICENSE
```

Do not create empty directories merely to match this diagram. Add structure as functionality requires it.

### `apps/plugin`

Responsibilities:

- run inside Framer;
- access Plugin API capabilities;
- observe editor state;
- execute validated editor commands;
- serialize Framer objects into transport-safe values;
- communicate with the local bridge/MCP process;
- expose connection state to the user;
- never contain MCP-specific business logic unnecessarily.

### `apps/mcp`

Responsibilities:

- expose MCP tools/resources;
- manage connected Framer editor sessions;
- validate agent input;
- translate MCP requests into protocol commands;
- normalize responses/errors for agents;
- enforce capability checks;
- avoid importing the Framer Plugin API.

### `packages/protocol`

Responsibilities:

- transport schemas;
- request/response envelopes;
- event messages;
- protocol versioning;
- runtime validation with Zod;
- no dependency on React or Framer runtime objects.

### `packages/core`

Responsibilities:

- normalized domain types;
- Framer+ node representation;
- capability model;
- mutation model;
- common errors;
- future Design IR foundations.

`core` must not become a dumping ground. Types should enter core only when they represent concepts meaningful beyond a single transport implementation.

---

## 7. Communication model

The plugin and MCP server are separate processes and need a local communication channel.

### Initial recommendation

Use a local WebSocket bridge hosted by the MCP process.

Reasons:

- bidirectional;
- event-friendly;
- straightforward reconnection semantics;
- supports selection-change notifications;
- easy to inspect during development;
- avoids polling;
- allows one MCP process to eventually track multiple editor sessions.

Conceptual flow:

```text
MCP process starts
    |
    +-- starts local bridge on loopback
            |
            +-- Framer plugin connects
                    |
                    +-- hello / negotiate protocol
                    +-- register session
                    +-- exchange RPC requests
                    +-- emit editor events
```

### Security constraints

The development bridge must:

- bind to loopback by default;
- reject unexpected origins/clients where practical;
- use a per-session random token or handshake secret;
- never expose the bridge to the LAN by default;
- impose payload limits;
- validate every message;
- use request timeouts;
- clean up disconnected sessions.

Do not treat localhost as inherently trusted.

### Protocol envelope

Recommended shape:

```ts
type ProtocolMessage =
  | {
      kind: "request"
      id: string
      method: string
      params: unknown
    }
  | {
      kind: "response"
      id: string
      ok: true
      result: unknown
    }
  | {
      kind: "response"
      id: string
      ok: false
      error: ProtocolError
    }
  | {
      kind: "event"
      event: string
      payload: unknown
    }
```

Every message carries a protocol version during session negotiation, not necessarily in every payload.

### Handshake

Plugin sends:

```json
{
  "kind": "hello",
  "protocolVersion": 1,
  "client": "framer-plugin",
  "clientVersion": "0.1.0",
  "sessionId": "...",
  "token": "..."
}
```

MCP bridge replies with accepted protocol version and capabilities.

Version mismatch must fail clearly rather than silently degrade.

---

## 8. Session model

A **session** represents one live plugin connection to one open Framer editor context.

Proposed fields:

```ts
interface EditorSession {
  sessionId: string
  connectedAt: string
  lastSeenAt: string
  pluginVersion: string
  protocolVersion: number
  project?: ProjectSummary
  capabilities: CapabilitySet
}
```

MVP behavior:

- zero sessions: read/write tools return `NO_EDITOR_SESSION`;
- one session: automatically use it;
- multiple sessions: require explicit `sessionId` unless a deterministic active-session mechanism exists.

Never silently write to an arbitrary project when multiple editor sessions are connected.

---

## 9. Capability model

Framer+ should describe what the current adapter/session can actually do.

Example:

```ts
interface CapabilitySet {
  projectRead: boolean
  selectionRead: boolean
  nodeRead: boolean
  nodeTreeRead: boolean
  nodeWrite: boolean
  responsiveRead: boolean
  responsiveWrite: boolean
  componentRead: boolean
  componentWrite: boolean
  cmsRead: boolean
  cmsWrite: boolean
  branchSupport: boolean
}
```

Capabilities prevent the MCP layer from promising operations unavailable in a specific API/version/context.

They also allow a future Server API adapter to expose a different subset without changing the entire MCP contract.

---

## 10. Canonical node model — v1

Do **not** return raw Framer objects to agents.

The first normalized representation should be intentionally conservative.

```ts
interface DesignNode {
  ref: NodeRef
  type: NodeType
  name?: string

  parent?: NodeRef
  children?: NodeRef[]

  layout?: LayoutSnapshot
  visual?: VisualSnapshot
  text?: TextSnapshot
  component?: ComponentSnapshot
  responsive?: ResponsiveSnapshot

  capabilities: NodeCapabilities
  metadata?: Record<string, JsonValue>
}
```

### Node reference

```ts
interface NodeRef {
  id: string
  sessionId?: string
}
```

Do not invent a new persistent ID if Framer already provides an identifier with adequate semantics. Wrap it so future adapters can evolve independently.

Never claim an ID is globally permanent unless Framer guarantees that property.

### Node types

Use a normalized enum only where it adds value:

```text
page
frame
stack
text
image
svg
component
component-instance
code-component
unknown
```

Retain the original Framer type as metadata when useful.

Do not discard unsupported types; represent them as `unknown` with raw type metadata.

---

## 11. Layout representation

The agent needs layout semantics, not only x/y coordinates.

Potential v1 shape:

```ts
interface LayoutSnapshot {
  positioning?: "flow" | "absolute" | "fixed" | "sticky" | "unknown"
  direction?: "horizontal" | "vertical" | "none"

  width?: DimensionValue
  height?: DimensionValue
  minWidth?: DimensionValue
  maxWidth?: DimensionValue
  minHeight?: DimensionValue
  maxHeight?: DimensionValue

  gap?: number | string
  padding?: Insets
  alignment?: Alignment
  distribution?: Distribution

  x?: number
  y?: number
  zIndex?: number
  overflow?: string
}
```

Dimension values must preserve semantics such as fixed, fill, fit-content and percentages whenever the API makes those distinctions available.

Bad normalization:

```json
{ "width": 412.347 }
```

if the actual design intent is `fill`.

Better:

```json
{ "width": { "mode": "fill" } }
```

Rendered dimensions can be exposed separately as measurements.

---

## 12. Responsive model

Responsive behavior is a first-class feature and one of the reasons Framer+ exists.

The model must distinguish:

1. breakpoint identity;
2. inherited value;
3. explicit override;
4. effective value;
5. source of the effective value.

Example:

```ts
interface ResponsiveProperty<T> {
  effective: T
  source: {
    kind: "base" | "breakpoint" | "variant" | "unknown"
    breakpointId?: string
  }
  override?: T
}
```

Conceptually:

```text
Desktop/base
  fontSize = 120

Tablet
  no override
  effective fontSize = 120

Phone
  override fontSize = 48
  effective fontSize = 48
```

An agent must be able to see that Tablet inherits `120`, rather than interpreting it as an independently authored `120`.

### Required responsive tools

Eventually:

```text
get_breakpoints
get_responsive_state
set_breakpoint_override
clear_breakpoint_override
```

### Mutation rule

`set_breakpoint_override` must never mutate the base property accidentally.

`clear_breakpoint_override` should restore inheritance rather than copying the current base value into a new local value.

### Investigation requirement

Before implementing responsive writes, verify exactly what the current Framer Plugin API exposes for breakpoint/replica/variant overrides. If the official API cannot represent a desired operation safely, Framer+ must report that limitation instead of simulating it destructively.

---

## 13. Tree traversal

Agents need project context, but dumping an entire large site into one response is wasteful.

`get_node_tree` should support bounded traversal.

Suggested input:

```ts
{
  root?: NodeRef
  depth?: number
  maxNodes?: number
  include?: Array<"layout" | "text" | "visual" | "component" | "responsive">
}
```

Defaults should be conservative.

Suggested response:

```ts
{
  root: NodeRef
  nodes: DesignNode[]
  truncated: boolean
  next?: TreeCursor
}
```

The response should make truncation explicit.

Never silently omit children and imply the tree is complete.

---

## 14. MCP tool surface

### Phase 1/2 read tools

#### `get_status`

Returns MCP process, bridge and editor-session health.

#### `list_sessions` — session discovery is provided by `get_status`

Only needed once multiple editor sessions are supported.

#### `get_project`

Returns normalized project/session summary.

#### `get_selection`

Returns selected node references and compact summaries.

#### `get_node`

Returns one normalized node.

#### `get_node_tree`

Returns bounded descendants.

#### `get_parent` — relationship is returned by `get_node`

Optional convenience tool if tree navigation proves common.

#### `get_children` — relationships are returned by `get_node` / `get_node_tree`

Optional convenience tool if bounded tree traversal is insufficient.

#### `get_breakpoints`

Returns breakpoint descriptors once reliable support is established.

#### `get_responsive_state`

Returns effective/inherited/override information for a node.

### Mutation tools

Do not expose a generic `execute_framer_api(method, args)` escape hatch.

Start with explicit tools.

#### `update_node`

Updates a limited allowlist of safe properties.

Suggested request:

```ts
{
  node: NodeRef
  changes: {
    name?: string
    layout?: Partial<MutableLayout>
    visual?: Partial<MutableVisual>
    text?: Partial<MutableText>
  }
  expected?: {
    revision?: string
  }
}
```

#### `set_breakpoint_override`

Explicit responsive mutation.

#### `clear_breakpoint_override`

Explicit inheritance restoration.

#### `delete_node` — planned, not implemented

Later and deliberately separated because deletion is destructive.

#### `create_node` — planned, not implemented

Later. Prefer typed creation operations rather than an unbounded generic node constructor.

---

## 15. Mutation safety

Every write passes through this conceptual pipeline:

```text
Agent request
   |
Schema validation
   |
Session/capability validation
   |
Resolve node
   |
Precondition checks
   |
Normalize mutation
   |
Apply through adapter
   |
Read back affected state
   |
Return mutation result
```

### Mutation result

```ts
interface MutationResult {
  changed: boolean
  node: NodeRef
  applied: MutationPatch
  warnings: MutationWarning[]
  snapshot?: DesignNode
}
```

### Optimistic concurrency

Once feasible, introduce revision/precondition support so an agent does not overwrite a node that changed after inspection.

If Framer does not expose a revision primitive, Framer+ can later derive a lightweight fingerprint from relevant properties, but this should not be presented as stronger consistency than it actually provides.

### Dry-run

A future `dryRun` mode is desirable for complex mutation batches.

### Batches

Do not implement broad batches until single-node mutation semantics are trustworthy.

When added, batches should support atomicity only if the underlying adapter can genuinely provide it. Otherwise call them ordered batches, not transactions.

---

## 16. Error model

Errors must be stable and agent-readable.

Proposed codes:

```text
NO_EDITOR_SESSION
MULTIPLE_EDITOR_SESSIONS
SESSION_DISCONNECTED
PROTOCOL_VERSION_MISMATCH
INVALID_REQUEST
CAPABILITY_UNAVAILABLE
NODE_NOT_FOUND
NODE_TYPE_UNSUPPORTED
PROPERTY_UNSUPPORTED
BREAKPOINT_NOT_FOUND
BREAKPOINT_WRITE_UNSUPPORTED
PRECONDITION_FAILED
PAYLOAD_TOO_LARGE
TREE_LIMIT_REACHED
FRAMER_API_ERROR
BRIDGE_TIMEOUT
INTERNAL_ERROR
```

Shape:

```ts
interface FramerPlusError {
  code: ErrorCode
  message: string
  retryable: boolean
  details?: Record<string, JsonValue>
}
```

Never make agents parse raw stack traces to understand normal operational failures.

Internal stacks can be logged in development.

---

## 17. Observability

Development logging should make the bridge debuggable without exposing secrets.

Log:

- connection/disconnection;
- protocol negotiation;
- request method and request ID;
- duration;
- response success/failure;
- Framer API failures;
- reconnect attempts.

Do not log:

- handshake secrets;
- API keys;
- huge node payloads by default;
- arbitrary CMS/user content unnecessarily.

Use structured logs in the MCP process when practical.

---

## 18. Plugin UX

The plugin UI should remain small during the MVP.

Required states:

```text
Framer+

● Connected
MCP bridge: localhost
Project: <project name if available>

Selection: 3 nodes
```

or:

```text
Framer+

○ Waiting for Framer+ MCP

Start the MCP server to connect an agent.
```

or:

```text
Framer+

! Connection error
Protocol versions are incompatible.
```

The plugin should not become a second design editor.

Its UI exists primarily for:

- connection state;
- permissions/safety controls later;
- session identity;
- diagnostics;
- explicit user approvals if required by future sensitive actions.

---

## 19. Components and variants

Components are not just nested frames and should be represented explicitly.

Future component model:

```ts
interface ComponentSnapshot {
  kind: "definition" | "instance"
  componentId?: string
  componentName?: string
  variant?: Record<string, string>
  overrides?: ComponentOverride[]
}
```

Framer+ should eventually support:

- list component definitions;
- inspect component instances;
- identify source component;
- inspect variant axes/values;
- distinguish component defaults from instance overrides;
- update an instance override;
- clear an instance override;
- modify a definition intentionally.

Safety requirement: changing an instance must not silently edit the shared definition, and editing a definition must clearly communicate that multiple instances may change.

---

## 20. Styles and design tokens

Agents should eventually reason about reusable design primitives.

Represent:

- color styles/tokens;
- text styles;
- fonts;
- reusable effects where accessible;
- spacing/layout primitives if Framer exposes meaningful reusable concepts.

A visual value should be able to indicate whether it is literal or token-backed.

Example:

```ts
{
  effective: "#ffffff",
  binding: {
    kind: "color-style",
    id: "...",
    name: "/Primary Text"
  }
}
```

This is essential for requests like "use the existing secondary text color".

---

## 21. Assets

Future asset support should expose semantic metadata rather than embedding huge binaries into MCP responses.

Asset reference:

```ts
interface AssetRef {
  id?: string
  kind: "image" | "svg" | "video" | "other"
  name?: string
  source?: string
  width?: number
  height?: number
}
```

Binary transfer should use dedicated mechanisms when needed.

Do not base64 large images into normal node inspection responses.

---

## 22. CMS

CMS support is valuable but not required for editor MVP.

When implemented, keep CMS concepts separate from canvas nodes:

```text
get_cms_collections
get_cms_collection
get_cms_items
create_cms_item
update_cms_item
```

Avoid one generic `update_data` tool that conflates design nodes and CMS records.

Mutating CMS should include clear collection/item identity and schema validation.

---

## 23. Branch-aware editing

Long-term agent safety improves significantly if complex edits can occur on an isolated Framer branch when the available Framer API supports that workflow.

Desired workflow:

```text
inspect project
    |
create agent branch
    |
perform edits
    |
validate
    |
user reviews
    |
merge or discard
```

Framer+ should not promise branch support until verified against the current official API and account/project constraints.

When implemented, MCP tools should expose branch identity explicitly.

---

## 24. Design snapshots

Agents benefit from compact snapshots representing a known state.

Potential uses:

- before/after comparison;
- mutation verification;
- debugging;
- future undo planning;
- code generation input;
- regression fixtures.

A snapshot is **structured design data**, not necessarily a screenshot.

Future shape:

```ts
interface DesignSnapshot {
  schemaVersion: number
  project: ProjectSummary
  root: NodeRef
  nodes: Record<string, DesignNode>
  tokens?: DesignTokens
  breakpoints?: Breakpoint[]
}
```

Snapshots must be versioned from day one if they become persisted artifacts.

---

## 25. Canonical Design IR

The Design IR is a post-MVP milestone and should not be confused with the initial normalized node model.

The node model is optimized for faithful inspection/editing of Framer.

The Design IR will be optimized for **semantic reconstruction and code generation**.

### Why a separate IR?

Framer's editor model and React's component model are not identical.

A direct one-node-to-one-div exporter would reproduce editor implementation details rather than application architecture.

The IR should allow transformations such as:

```text
Framer layers
    |
normalize
    |
infer semantic groups
    |
resolve responsive behavior
    |
identify reusable structures
    |
Design IR
    |
React generator
```

### Possible IR concepts

```ts
interface DesignDocument {
  pages: DesignPage[]
  components: DesignComponent[]
  tokens: DesignTokens
  assets: AssetRef[]
}

interface DesignElement {
  id: string
  role: ElementRole
  layout: SemanticLayout
  style: SemanticStyle
  content?: SemanticContent
  responsive?: ResponsiveRules
  children: DesignElement[]
}
```

Roles might include:

```text
section
container
stack
heading
paragraph
button
link
image
navigation
card
list
form
custom
```

These roles may be inferred, explicit, or unknown.

The IR must preserve uncertainty rather than pretending every layer's semantic purpose is known.

---

## 26. React export philosophy

React export is successful only if a developer would plausibly continue working with the generated project.

### Desired output

```tsx
export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.content}>
        <SocialLinks />
        <div className={styles.heading}>
          <h1>Developing</h1>
          <RotatingHeadline />
        </div>
      </div>
    </section>
  )
}
```

### Undesired output

```tsx
<div style={{ position: "absolute", left: 123.483, top: 71.2 }}>
  <div className="framer-a8d92">...</div>
</div>
```

unless absolute positioning is genuinely the semantic layout.

### Export goals

Generated code should prefer:

- semantic HTML;
- reusable React components;
- understandable names;
- flex/grid before absolute positioning when semantically equivalent;
- CSS variables/design tokens;
- responsive media/container rules;
- accessible links/buttons/images;
- local reusable primitives;
- minimal runtime dependencies;
- deterministic formatting.

### Export modes

Do not implement all initially, but architecture may eventually support:

```text
react
react + css modules
react + tailwind
next.js
astro
```

The first generator should be plain React with a simple styling strategy.

### No fake fidelity

If an effect or Framer-specific interaction cannot be represented faithfully, emit a warning/annotation rather than silently generating misleading code.

---

## 27. Bidirectional workflows

This is exploratory and late-stage.

Potential future capabilities:

- generate React from a Framer component;
- generate/update a Framer Code Component from code;
- compare generated code with current design;
- map code components back into the Design IR;
- preserve stable mappings across regeneration.

Do not promise arbitrary round-trip fidelity. Visual editors and source code have different abstractions.

---

## 28. Testing strategy

Testing should be layered.

### Protocol tests

Fast unit tests for:

- schema acceptance/rejection;
- protocol envelopes;
- version negotiation;
- error serialization.

### Core tests

Unit tests for:

- normalization;
- capability resolution;
- mutation validation;
- responsive property semantics;
- snapshot transformations.

### Adapter tests

Where possible, isolate Framer API access behind interfaces and test mapping logic with fixtures/mocks.

Do not mock the entire product and call it integration coverage.

### Integration tests

Run plugin + bridge + MCP together and verify:

```text
connect
get_status
get_selection
get_node
get_node_tree
update supported property
read back changed property
```

### Fixture project

Eventually maintain a small Framer test project containing:

- desktop/tablet/phone breakpoints;
- nested stacks;
- absolute positioning;
- text styles;
- color styles;
- components;
- variants;
- instance overrides;
- images/SVGs;
- sticky/fixed elements;
- intentionally awkward edge cases.

### Export golden tests

When code generation arrives, Design IR fixtures should generate deterministic expected files.

Avoid relying exclusively on snapshots so semantic regressions remain understandable.

---

## 29. Performance constraints

Large Framer projects can contain many nodes.

Rules:

- never traverse the entire project by default;
- bound tree depth and node count;
- avoid returning binary assets inline;
- cache only when invalidation semantics are understood;
- prefer compact summaries for selection results;
- allow agents to progressively inspect deeper levels;
- add pagination/cursors when APIs can produce large collections;
- enforce bridge payload limits.

Measure before introducing complicated caching.

---

## 30. Privacy and local-first behavior

The MVP should work locally without requiring a Framer+ cloud service.

Preferred path:

```text
Agent client <-> local MCP <-> local bridge <-> Framer plugin
```

Framer+ should not upload project structure to Vytral infrastructure as a hidden requirement.

If a hosted service is introduced later, it must be an explicit architectural/product decision with documented data handling.

---

## 31. Compatibility and versioning

There are three relevant versions:

1. Framer+ application/package version;
2. Framer+ bridge protocol version;
3. persisted snapshot/Design IR schema version.

They should not be conflated.

Example:

```ts
const APP_VERSION = "0.4.0"
const PROTOCOL_VERSION = 2
const SNAPSHOT_SCHEMA_VERSION = 1
```

Use semantic versioning for public packages/releases once the project reaches usable releases.

Protocol changes should document compatibility.

---

## 32. Dependency policy

Prefer a small dependency surface.

Core choices:

- TypeScript;
- pnpm workspaces;
- Zod for runtime schemas;
- official MCP SDK;
- official Framer APIs/packages;
- React only where the plugin UI requires it.

Do not add frameworks/libraries for functionality easily implemented with platform primitives.

Every runtime dependency increases open-source maintenance cost.

---

## 33. Coding conventions

Initial conventions:

- TypeScript strict mode;
- avoid `any` except at deliberate API boundaries;
- validate untrusted transport input at runtime;
- prefer named domain types over anonymous nested objects when reused;
- no raw Framer runtime objects across the bridge;
- no secrets committed to the repository;
- keep functions focused;
- comments explain non-obvious intent, not syntax;
- exported APIs should have concise documentation;
- avoid speculative abstraction.

Formatting/lint tooling can be standardized in Phase 0 rather than adding multiple overlapping tools immediately.

---

# Implementation phases

## Phase 0 — Foundation

### Objective

Turn the scaffold into a reproducible, type-safe development workspace.

### Tasks

- [x] Verify the current Framer plugin scaffold against current official plugin requirements. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Correct `framer.json` fields/modes if needed. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Pin sensible dependency versions; avoid uncontrolled `latest` where reproducibility matters. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add root TypeScript configuration if it meaningfully reduces duplication. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add formatting and linting with one coherent toolchain. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add root `check` command. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Ensure all packages typecheck. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Ensure plugin development server starts. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Ensure MCP process starts. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add minimal contribution/development notes to README when commands stabilize. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Establish package naming and internal exports. **I; verification and native acceptance are tracked in phase evidence.**

### Definition of Done

A fresh clone can run:

```bash
pnpm install
pnpm typecheck
pnpm build
```

and start both development applications using documented commands.

No application-level bridge functionality is required yet.

---

## Phase 1 — Plugin ↔ MCP Bridge

### Objective

Establish a reliable authenticated local connection between the Framer plugin and MCP process.

### Tasks

- [x] Implement loopback bridge server in `apps/mcp`. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Implement plugin bridge client. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Define protocol request/response/event envelopes. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add protocol version negotiation. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add session IDs. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add per-run authentication token/handshake strategy. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add request IDs and timeouts. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add reconnect with bounded backoff. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add heartbeat or equivalent stale-session detection if necessary. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Validate all bridge messages using shared schemas. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Expose connection state in plugin UI. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Upgrade `get_status` to report real bridge/editor state. **I; verification and native acceptance are tracked in phase evidence.**

### MCP tools

```text
get_status
```

### Tests

- successful connection;
- invalid token;
- incompatible protocol version;
- disconnect/reconnect;
- timed-out request;
- malformed payload;
- MCP running without plugin;
- plugin running without MCP.

### Definition of Done

An MCP client can call `get_status` and reliably determine whether a live Framer editor plugin is connected.

---

## Phase 2 — Project & Canvas Inspection

### Objective

Give agents a trustworthy read-only view into the open Framer project.

### Tasks

- [x] Research current official APIs for project metadata and canvas roots. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Implement project summary normalization. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Implement selection reading. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Implement normalized node conversion. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Implement parent/child relationships. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Implement bounded tree traversal. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Normalize basic layout properties. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Normalize text information. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Normalize basic visual information. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Include node capabilities. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Handle unknown/unsupported node types without crashing. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add truncation/cursor semantics for large trees. **I; verification and native acceptance are tracked in phase evidence.**

### MCP tools

```text
get_project
get_selection
get_node
get_node_tree
```

Potentially:

```text
get_children
get_parent
```

only if actual agent usage demonstrates value.

### Definition of Done

Given the user's portfolio project, an agent can inspect the Home page hierarchy, identify major sections and inspect selected elements without relying on HTML or screenshots.

---

## Phase 3 — Safe Node Mutation

### Objective

Allow a small set of predictable edits while preserving project structure.

### Initial writable properties

Start conservatively. Candidate categories:

- node name;
- text content;
- basic dimensions;
- gap;
- padding;
- alignment;
- basic visual properties known to be safe.

Do not enable a property merely because Framer technically exposes it.

### Tasks

- [x] Define mutable schemas separately from read snapshots. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add capability validation. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Implement `update_node`. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Read back state after mutation. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Return applied changes and warnings. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add unsupported-property errors. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Investigate lightweight preconditions/revisions. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Add audit-style development logging. **Partial: content-free local outcomes; no persistent cross-session audit store.**

### Definition of Done

An agent can inspect a node, make a supported intentional change and immediately verify the resulting normalized state.

---

## Phase 4 — Responsive & Breakpoints

### Objective

Solve the original problem that motivated Framer+: reliable agent understanding and editing of responsive Framer designs.

### Research gate

Before coding mutations, document the exact behavior of the current Framer API for:

- page breakpoints;
- replica/variant nodes;
- inherited properties;
- breakpoint overrides;
- effective values;
- adding/removing overrides;
- relationships between primary and responsive replicas.

Do not infer API semantics from the existing Unframer connector.

**Research finding (2026-10-02, Plugin API 5.1.0):** the public API exposes
real breakpoint frames, replica identities and local writes to exposed replica
attributes, but does not expose per-property override flags, override removal,
or isolated node `fontSize` writes. The font-size acceptance example and complete
clear-override semantics remain blocked on API support. Framer+ reports unknown
inheritance and unsupported operations explicitly. See [Phases 2–4 evidence](PHASES_2_4.md).

### Tasks

- [x] Define `Breakpoint` model. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Define responsive property model. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Expose breakpoint list. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Expose responsive state for a node/property. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Distinguish inherited/effective/override values. **Partial / API-limited: effective values and identity known; per-property provenance remains unknown.**
- [x] Implement override writes only where officially supported. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Implement clear-override semantics. **API-limited: explicit unsupported error; copying base values would not restore inheritance.**
- [x] Prevent accidental base mutation. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add responsive diagnostics. **I; verification and native acceptance are tracked in phase evidence.**

### MCP tools

```text
get_breakpoints
get_responsive_state
set_breakpoint_override
clear_breakpoint_override
```

### Test scenario

Use a page with Desktop, Tablet and Phone.

An agent must be able to determine:

```text
Desktop: font-size 120 (base)
Tablet:  font-size 120 (inherited)
Phone:   font-size 48  (override)
```

and update only Phone without changing Desktop/Tablet.

### Definition of Done

The portfolio Home page can be inspected and responsive corrections can be made without the inheritance ambiguity that blocked the original workflow.

---

## Phase 5 — Components & Variants

### Objective

Make reusable Framer structures first-class to agents.

### Tasks

- [x] Identify component definitions. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Identify instances. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Resolve instance → definition relationship. **Partial: identifier resolution for unique local definitions; external/ambiguous references remain unresolved.**
- [ ] Read variant axes/values. **Partial / API-limited: concrete variant frames; selected axes unavailable.**
- [ ] Read instance overrides. **Partial / API-limited: current controls known; override provenance unavailable.**
- [x] Distinguish definition changes from instance changes. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Add safe instance mutation. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Add clear-instance-override semantics where supported. **API-limited: explicit unsupported error; no public reset operation.**

### Public Plugin API finding (2026-10-02)

API 5.1.0 exposes component identifiers, instance control values and concrete
variant frames. Local definitions can be resolved by identifier; external or
ambiguous definitions remain explicit. Selected variant axes, per-control
override provenance and override reset are not exposed on public instance nodes.
The supported adapter edits existing primitive instance controls, while complete
variant/reset acceptance remains pending API support. See [Phases 5–7](PHASES_5_7.md).

### Definition of Done

An agent can explain whether a selected object is a component definition or instance, identify its variant and modify an instance without unintentionally editing every use.

---

## Phase 6 — Tokens, Assets & CMS

### Objective

Expose the supporting systems required for project-wide coherent edits.

### Workstreams

#### Tokens/styles

- color styles;
- text styles;
- bindings;
- literal vs token-backed values.

#### Assets

- image/SVG metadata;
- asset references;
- controlled insertion/replacement later.

#### CMS

- collections;
- schemas;
- items;
- validated mutations.

### Definition of Done

An agent can reuse existing design primitives instead of hard-coding visually similar replacements.

---

## Phase 7 — Agent Safety & Complex Changes

### Objective

Support larger agent tasks without sacrificing user control.

### Tasks

- [x] Mutation batches. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Dry-run planning. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Precondition/fingerprint checks. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Change summaries. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Destructive-operation separation. **Partial: destructive operations are absent; create/move/delete safety implementation remains pending.**
- [ ] Branch-aware workflow if supported. **Partial: active branch inspection and context guards; no branch creation/switch/merge.**
- [ ] Better audit history. **Partial: bounded session-memory history only.**
- [x] Optional user approval gates for broad changes. **I/A: exact plugin approval is mandatory for reviewed plans; direct single-target tools are separate.**

### Definition of Done

An agent can safely perform a multi-node refactor and present an understandable summary of what changed.

---

## Phase 8 — Developer Experience & Public Alpha

### Objective

Make Framer+ usable by people other than its authors.

### Tasks

- [x] Installation guide. **I; verification and native acceptance are tracked in phase evidence.**
- [x] MCP client examples. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Troubleshooting guide. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Contribution guide. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Architecture documentation extracted from this plan. **I; verification and native acceptance are tracked in phase evidence.**
- [x] CI for checks/tests. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Release workflow. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Changelog strategy. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Example Framer project/fixtures where licensing permits. **Partial: synthetic MIT fixtures; no distributable native Framer acceptance project.**
- [x] Security policy. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Issue templates only if useful. **Deferred: not required for this alpha; no templates implemented.**
- [x] Public alpha versioning. **I; verification and native acceptance are tracked in phase evidence.**

### Definition of Done

A developer unfamiliar with the repository can install Framer+, connect an MCP client and inspect a project using documentation alone.

---

## Phase 9 — Design IR

### Objective

Create a semantic representation suitable for analysis and code generation.

### Tasks

- [x] Define versioned IR schema. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Build Framer → IR transformation pipeline. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Resolve responsive rules. **Partial: explicit supplied viewport ranges and replica mapping; no invented inheritance or inferred media-query thresholds.**
- [x] Map design tokens. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Infer semantic roles conservatively. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Detect reusable structures. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Preserve unsupported/unknown features as annotations. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Create deterministic IR fixtures. **I; verification and native acceptance are tracked in phase evidence.**

### Definition of Done

A representative Framer page can be transformed into a stable IR that describes the design without depending on Framer runtime objects.

---

## Phase 10 — React Code Generation

### Objective

Generate maintainable React from the Design IR.

### Tasks

- [x] Component boundary strategy. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Naming strategy. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Semantic HTML mapping. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Layout conversion. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Responsive CSS generation. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Token → CSS variable mapping. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Asset handling. **I; verification and native acceptance are tracked in phase evidence.**
- [ ] Accessibility pass. **Partial: focus/semantic markup and diagnostics; no complete native/export accessibility acceptance.**
- [x] Unsupported-feature annotations. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Deterministic formatting. **I; verification and native acceptance are tracked in phase evidence.**
- [x] Golden-file tests. **I; verification and native acceptance are tracked in phase evidence.**

### Quality gate

Do not call the exporter successful merely because output renders similarly.

Generated code must also be understandable and maintainable.

### Definition of Done

A representative Framer landing page can be exported to a standalone React project that passes its checks and has a structure a developer can reasonably edit.

---

## Phase 11 — Bidirectional & Advanced Agent Workflows

### Objective

Explore deeper design/code interoperability.

Possible work:

- Framer Code Component workflows;
- source mappings;
- regeneration with preserved edits;
- design/code comparison;
- agent-created components;
- headless Server API adapter;
- remote automation.

This phase is intentionally open-ended and should be planned from evidence gathered in earlier phases.

---

## Phase 12 — Stable Public Release

### Objective

Turn a useful developer project into a sustainable open-source tool.

Potential requirements:

- stable protocol documentation;
- compatibility policy;
- migration notes;
- plugin distribution/Marketplace evaluation;
- telemetry decision (default should remain privacy-respecting; no hidden telemetry);
- maintainership model;
- contributor governance as needed;
- stable release line.

---

# 34. Recommended immediate implementation order

Historical scaffold ordering below is retained for context. The alpha reconciliation and release gates above govern current work; this is not an instruction to repeat Phase 0.

Codex should **not** attempt all phases.

The next implementation session should work only on Phase 0, then stop for review.

Recommended sequence:

```text
1. Audit current scaffold against official Framer docs.
2. Make workspace reproducible.
3. Make typecheck/build clean.
4. Verify plugin can actually be loaded in Framer.
5. Verify MCP starts and get_status works.
6. Commit Phase 0.
7. Stop.
8. Review before designing the bridge implementation.
```

The bridge transport should be confirmed after Phase 0 rather than buried inside scaffold cleanup.

---

# 35. Instructions for coding agents

When this document is provided to Codex or another coding agent:

1. **Treat this file as project direction, not permission to implement every future phase.**
2. Work only on the explicitly requested phase.
3. Read the current repository before making architectural assumptions.
4. Check current official Framer documentation for API behavior that may have changed.
5. Do not invent Framer APIs.
6. Do not replace structured semantics with HTML scraping.
7. Do not add a generic arbitrary-Framer-API MCP tool.
8. Keep the protocol transport-safe and runtime-validated.
9. Do not expose secrets in logs or commits.
10. Prefer small coherent commits.
11. Run the relevant checks before declaring a phase complete.
12. Report unverified Framer-runtime behavior explicitly.
13. Do not silently broaden scope into future phases.
14. Update this plan only when an implementation discovery invalidates or materially changes a documented assumption.
15. Preserve the central invariant: **Framer+ exists to let agents understand and intentionally manipulate design structure, not merely automate clicks or scrape rendered output.**

---

# 36. MVP acceptance scenario

The MVP should ultimately pass this human-level scenario:

1. User opens a real Framer project.
2. User opens Framer+.
3. Framer+ connects to the local MCP process.
4. Agent calls `get_status` and sees the editor session.
5. Agent calls `get_project`.
6. User selects the Home page hero.
7. Agent calls `get_selection`.
8. Agent traverses the hero using `get_node_tree`.
9. Agent identifies Desktop/Tablet/Phone responsive behavior.
10. Agent determines which values are inherited and which are overrides.
11. User asks: "Make the Phone headline smaller without changing Desktop or Tablet."
12. Agent inspects current state.
13. Agent applies an explicit Phone override.
14. Framer+ reads back the state.
15. Agent reports exactly what changed.
16. Desktop and Tablet remain untouched.

This is the first major product proof.

It directly solves the limitation that motivated Framer+.

---

# 37. Long-term success scenario

A mature Framer+ should support a workflow like:

```text
"Take this Framer landing page and implement it in React."

Agent
  -> inspects project
  -> reads components and breakpoints
  -> resolves design tokens
  -> builds Design IR
  -> identifies reusable sections
  -> generates React components
  -> generates responsive styling
  -> preserves assets
  -> reports unsupported Framer-specific behavior
  -> runs checks
  -> produces a maintainable application
```

The important word is **maintainable**.

Framer+ should not win by producing the most markup. It should win by giving agents enough structured context to make good engineering decisions.

---

# 38. Open questions

These should be answered through implementation/research rather than guessed prematurely.

### Framer API

- What exact breakpoint and replica metadata is exposed to plugins today?
- Can breakpoint overrides be read and cleared explicitly?
- Which node identifiers are stable across editor operations?
- What project metadata is available to plugins vs Server API?
- Which operations require specific plugin modes or permissions?
- What branch APIs are available and under what project/account conditions?
- How are Code Components represented through current APIs?

### Bridge

- Can the Framer plugin connect directly to a loopback WebSocket under current plugin security constraints?
- What origin/CSP restrictions need handling?
- What is the cleanest token bootstrap UX?
- Should the MCP process choose a fixed configurable port or ephemeral port with discovery?

### Domain model

- Which Framer layout values require lossless special representations?
- How much visual style data is useful before responses become noisy?
- Which properties should `get_node` include by default versus opt-in sections?

### Code generation

- Which semantic roles can be inferred reliably?
- When should component extraction be deterministic vs agent-assisted?
- Which styling output should be the first supported target?
- How should Framer motion/interactions map to code?

These questions are intentionally retained as open questions so future contributors do not mistake assumptions for established behavior.

---

# 39. Release philosophy

Suggested progression:

```text
0.0.x  internal development / architecture can move quickly
0.1.0  first usable read-only MCP alpha
0.2.0  safe basic mutation
0.3.0  responsive workflows
0.4.0  components/variants
0.5.0  broader project systems
...
1.0.0  stable public contract once real usage justifies it
```

This is directional, not a promise. Do not version features mechanically if development reality suggests a better sequence.

---

# 40. Final product invariant

When choosing between two implementations, prefer the one that better answers this question:

> **Does this help an AI agent understand what the designer intended, and change it without destroying the structure that made the design understandable?**

If the answer is no, it probably does not belong in Framer+.
