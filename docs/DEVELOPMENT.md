## Getting Started

Framer+ is currently in early development.

Requirements:

- Node.js 22.19+ (Node.js 24 LTS recommended)
- pnpm 12.8.1, pinned in `package.json`
- Framer desktop or web editor with Developer Tools enabled

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Validate the workspace:

```bash
pnpm check
```

This runs Biome, strict TypeScript checks for source and tests, the bridge test
suites, and all builds.
Individual commands are `pnpm lint`, `pnpm typecheck`, `pnpm build`, and
`pnpm format` (formatting writes changes).

Run the plugin in an interactive terminal:

```bash
pnpm dev:plugin
```

The development server uses HTTPS at `https://127.0.0.1:5173` and binds only to
loopback. The official Framer Vite integration serves the plugin manifest and
provides the browser fallback. On the first run, `vite-plugin-mkcert` downloads
mkcert, creates a local development CA, and installs it in the system trust store.
macOS may request an administrator password; complete this step in your own
terminal. A non-interactive process cannot complete that first-time setup.
If a certificate was already generated without installing trust, install the
existing CA explicitly in your own terminal (default macOS/Linux location):

```bash
CAROOT="$HOME/.vite-plugin-mkcert" "$HOME/.vite-plugin-mkcert/mkcert" -install
```

Keep the generated private keys outside the repository and never commit them.

In Framer, enable Developer Tools in the Plugin menu, then choose **Open
Development Plugin**. Use the development URL if prompted. The plugin should
show **Waiting for MCP** and update its selection count as you select canvas nodes.
Opening the URL directly in a browser shows Framer's fallback, which does not
verify that the Plugin API works inside the editor.

Run the MCP server for source development:

```bash
pnpm dev:mcp
```

This is a stdio MCP process: it waits for an MCP client and does not print a
startup banner to stdout. For an MCP client, build first and launch Node directly
so package-manager output cannot interfere with the protocol:

```bash
pnpm build
node /absolute/path/to/framer-plus/apps/mcp/dist/index.js
```

Example client configuration (replace the absolute path):

```json
{
  "mcpServers": {
    "framer-plus": {
      "command": "node",
      "args": ["/absolute/path/to/framer-plus/apps/mcp/dist/index.js"]
    }
  }
}
```

`pnpm start:mcp` is also available for launching the compiled process manually.
The MCP process starts a secure local WebSocket bridge at
`wss://127.0.0.1:5174/bridge`. Start only one MCP process on that port. When an MCP
client launches its own process, stop your manual development process first.

### Pair the editor plugin

On startup, MCP prints the path of a connection file to **stderr**, for example:

```text
Framer+ bridge ready. Pair the plugin using: /home/you/.config/framer-plus/connection-12345.json
```

The file contains the bridge URL and a fresh random credential. Its permissions
are `0600`, inside a `0700` directory. It is removed on normal shutdown or MCP
stdin closure. An abrupt kill may leave an obsolete file; its credential is no
longer accepted. Use the path printed by the current process.

On macOS, copy that file's contents in your own terminal (replace `12345`):

```bash
pbcopy < "$HOME/.config/framer-plus/connection-12345.json"
```

Paste into **MCP connection JSON** in the Framer+ plugin and click **Connect**.
Credentials are masked, cleared from the form on connect, and held only in
memory. They are not stored in browser storage, URLs, or logs. Do not share the
connection file or paste its contents into an issue or chat.

After pairing, the plugin shows **Connected** and the abbreviated editor session
ID. The MCP client can call `get_status` to see `connected: true`,
`bridge: "listening"`, protocol version, timestamps, capabilities, and live editor
sessions. Project inspection and supported mutations are exposed through the tools below. The status
call probes each editor with a bounded RPC request before reporting it as live.
With zero editors it returns `connected: false`. Multiple editors have no
implicit active session; targeted operations must specify a session ID.

The plugin reconnects automatically with a delay capped at 10 seconds. Restarting
MCP rotates the credential: paste the new connection file and connect again.
Invalid credentials or incompatible protocol versions stop automatic retries
and show an actionable error. **Disconnect** clears the in-memory credential.

### Bridge configuration and troubleshooting

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `FRAMER_PLUS_BRIDGE_PORT` | `5174` | Loopback bridge port |
| `FRAMER_PLUS_TLS_CERT` | `~/.vite-plugin-mkcert/cert.pem` | Trusted PEM certificate path |
| `FRAMER_PLUS_TLS_KEY` | `~/.vite-plugin-mkcert/dev.pem` | PEM private key path |
| `FRAMER_PLUS_PLUGIN_ORIGINS` | `https://localhost:5173,https://127.0.0.1:5173` | Exact allowed HTTPS plugin origins |

Paths in environment variables must be expanded absolute paths. For a hosted
plugin, set its exact iframe origin; no origin wildcard is accepted. The bridge
always binds to `127.0.0.1`, never to the LAN, and only accepts `/bridge` upgrades
from allowed origins. It has a 64 KiB message limit, 32-socket limit, five-second
handshake and ping deadlines, 15-second design request deadlines, and ten-second heartbeat intervals.

If the plugin keeps reconnecting, check that MCP is running, the configured port
matches the connection file, and the browser trusts the development CA. Firefox
needs NSS/certutil installed for mkcert trust setup. WebSocket errors hide HTTP
and TLS details from browser JavaScript; inspect the browser network/console
panel when necessary. A `403` upgrade means the origin/path was rejected.

Run `pnpm test` for the bridge and browser-client suites. The automated transport
tests use an injected local HTTP listener; they do not certify Framer's browser
CSP or certificate trust. See [Phase 1 validation](PHASE_1.md) for the WSS
integration check and the confirmed real-editor pairing.

### Inspect and edit a project

Protocol version 4 exposes `get_project`, `get_selection`, `get_node`,
`get_node_tree`, `update_node`, `get_breakpoints`, `get_responsive_state`,
`set_breakpoint_override`, and `clear_breakpoint_override` alongside `get_status`, page discovery and resource/plan tools.
Restart MCP and reconnect the plugin after updating from protocol version 1 or 2.

Read the selection or canvas before writing. Node references contain both
`id` and `sessionId`; they cannot be reused across editor sessions. Tree reads
are bounded live pages: follow `cursor` with `sessionId` and `maxNodes`, or
inspect `continuationRoots` to explore beyond the depth boundary. Truncation
and warnings are explicit; these are not atomic project snapshots.

For base edits, pass `scope: "base"`, the node reference, supported `changes`,
and preferably `expected: { "revision": "<revision from get_node>" }`.
For example, `changes: { "layout": { "gap": 24 } }` updates a supported frame.
Text replacement is a separate operation and can replace rich text formatting.
Every successful mutation returns the read-back snapshot. Base edits can
propagate to responsive replicas. Locked nodes, components, variants and
unsupported properties are rejected.

Responsive writes require an existing replica and its explicit non-primary
breakpoint reference. Exposed layout and visual properties are supported.
The public Plugin API does not expose per-property override flags, effective
node font size or override removal: inheritance on replicas remains `unknown`,
`text.fontSize` is unsupported, and `clear_breakpoint_override` returns
`BREAKPOINT_WRITE_UNSUPPORTED`. Equal values never establish inheritance.

Mutation timeouts or failures after a native write can mean the edit happened.
Inspect the node before deciding to retry. These errors are non-retryable;
there are no automatic write retries or promised atomic rollback. Development
mutation logs go to stderr and contain method/outcome/error code, never design
content or credentials. See [implementation and validation](PHASES_2_4.md).

### Components, resources and change plans

| Area | Tools |
| --- | --- |
| Components | `get_components`, `get_component`, `update_instance`, `clear_instance_override` |
| Styles/assets | `get_styles`, `get_assets`, `apply_style` |
| CMS | `get_collections`, `get_collection_schema`, `get_collection_items`, `update_collection_item` |
| Safety | `get_branch`, `plan_changes`, `get_change_plan`, `execute_change_plan`, `get_audit_log` |

Resource lists use `offset` and `limit` (default 50, maximum 100). Follow
`nextOffset` and inspect truncation: these are live lists and offsets do not
provide an atomic snapshot. The native SDK may fetch a complete resource list
before Framer+ bounds its response. `get_assets` accepts `kind: "image"` (default)
or `kind: "svg"`; images list bounded consumers and SVGs expose byte-length
metadata. Neither is a complete asset library or raw-content download.

Inspect an instance with `get_component` before `update_instance`. Pass
`scope: "instance"`, existing primitive `controls` and its `expected.revision`.
Bindings and complex controls are read-only. Concrete definition variant frames
are exposed; selected variant axes and per-control override provenance are
unavailable. `clear_instance_override` returns `OVERRIDE_CLEAR_UNSUPPORTED`.

`apply_style` references an existing style ID with explicit base scope and node
revision; it binds a color style to a frame or a text style to a text node.
It does not edit shared style definitions. CMS patches require collection/item
IDs, the item's revision, and supplied `fields` keyed by field IDs with typed
string/number/boolean values. Managed collections, bound fields and complex
values are rejected. Creation, deletion, publishing and localization writes
are outside this tool surface.

For multiple node edits, call `plan_changes` with a title and up to ten distinct
operations. Each operation has `node`, `scope`, `changes`, `expected.revision`,
and an explicit `breakpoint` when scope is `breakpoint`. The dry-run performs no
native edit. Review current/requested values and approve or reject the exact plan
in the plugin. Approval does not execute it; the agent calls `execute_change_plan`
with the returned `planId`. Plans expire in five minutes; disconnection revokes
pending approvals. Revisions and execution checks include project/active branch.

Execution validates every target before starting, runs sequentially, and stops
at the first failure. It returns verified/failed/skipped outcomes; partial edits
are possible and there is no automatic rollback or replay. After a timeout,
inspect plan status and affected nodes. Audit history retains the latest 100
content-free outcomes in plugin memory only. Branch APIs are inspection/fences;
Framer+ does not create, switch, merge or publish branches.

See [Phases 5–7 implementation and limits](PHASES_5_7.md).

### Development conventions

Use `@framer-plus/*` for workspace package names. Shared packages expose compiled
ES modules and declarations from `dist`; rebuild them after changes before using
them from another package. Keep Framer runtime objects in the plugin, shared
transport schemas in `protocol`, and domain concepts in `core`.

Install with `pnpm install --frozen-lockfile` when reproducing a checkout. Commit
manifest changes together with `pnpm-lock.yaml`. The workspace keeps pnpm's
one-day minimum release age and explicitly allows only esbuild's install script.
Run `pnpm check` before contributing changes. See [the project plan](PROJECT_PLAN.md)
for phase boundaries and acceptance criteria.

## Roadmap

### MVP

- [ ] Connect the Framer plugin to the MCP server
- [ ] Read project metadata
- [ ] Read the current selection
- [ ] Traverse the node tree
- [ ] Expose stable node identifiers
- [ ] Read responsive layout information
- [ ] Apply safe node updates
- [ ] Add basic validation and error reporting

### Later

- [ ] Components and variants
- [ ] CMS support
- [ ] Assets and design tokens
- [ ] Branch-aware editing
- [ ] Design snapshots for agents
- [ ] Canonical design representation
- [ ] Clean React export
- [ ] Additional code generators

## Principles

Framer+ should prefer structured design data over generated markup.

Agents should be able to reason about pages, components, layout, breakpoints and intent instead of reverse-engineering opaque HTML.

Changes should also be explicit, inspectable and safe by default.

## License

MIT © Vytral

## Alpha workflows and release readiness

Version `0.1.0-alpha.1` adds five local design tools: `capture_design`, `inspect_design_artifact`, `generate_react`, `compare_design_artifacts` and `regenerate_react` (31 total production MCP tools including status). Read [Architecture](ARCHITECTURE.md), [Design workflows](DESIGN_WORKFLOWS.md), [Release and compatibility](RELEASE.md), [Contributing](CONTRIBUTING.md) and [Security](SECURITY.md).

`pnpm verify:export` checks the generated synthetic landing with strict TypeScript and a production Vite build. `pnpm release:prepare` creates a local alpha archive after building. No stable or Marketplace release is certified or published. See [Phases 8–12 status](PHASES_8_12.md) for evidence and remaining native acceptance gates.
