# Framer+

Framer+ lets AI agents inspect and safely work with real Framer projects through MCP.

**Experimental alpha: `v0.1.0-alpha.1`.** Local development installation; no stable compatibility or full-fidelity promise.

## What works

- Discover and explicitly open pages, inspect hierarchies, selection, text, layout, visuals and responsive replicas.
- Inspect components and supported controls, reusable styles, referenced assets and CMS.
- Edit supported properties with scope checks, revision preconditions and readback verification.
- Prepare one reviewed plan for up to ten targets across pages, responsive views, instance controls, style bindings and scalar CMS records.
- Capture a semantic Design IR and generate deterministic React fixtures with explicit limitations.

Plans require approval in the plugin. Execution is sequential: failures stop subsequent writes and report partial or uncertain outcomes. No atomic transaction or rollback is promised. Direct single-target mutation tools also exist; use reviewed plans for broad changes.

## Three parts

| Part | Purpose |
| --- | --- |
| **Framer+ Plugin** | Reads and operates inside the editor through the public Framer Plugin API. |
| **Framer+ MCP** | Gives agents 33 semantic tools through stdio; pairs with the plugin through authenticated local WSS. |
| **Design IR / exporters** | Reuses semantic inspection for snapshots and maintainable code generation. Export is a supporting capability. |

## Development

Requirements: Node **22.19+**, pinned **pnpm 12.8.1**, and Framer with Developer Tools enabled.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm dev:plugin
```

The plugin serves at `https://127.0.0.1:5173`. Complete the local certificate trust prompt in your terminal. In Framer, enable Developer Tools and choose **Open Development Plugin**.

Build the MCP and configure your MCP client to launch it:

```bash
pnpm build
```

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

Use the connection file path printed to **stderr** by that client-owned process. On macOS:

```bash
pbcopy < "$HOME/.config/framer-plus/connection-<pid>.json"
```

Paste into **MCP connection JSON** in the plugin and click **Connect**. Never share the file contents. Call `get_status`, then `get_project` and `get_pages` to begin. Run only one MCP process per bridge port; a manually started process is separate from the process your client launches.

See the [development guide](docs/DEVELOPMENT.md) for CA setup, troubleshooting, environment settings and tool workflows.

## Limits and evidence

Responsive effective values and replica/original identities are exposed. Per-property inheritance/override provenance, override reset and isolated node font-size writes are unavailable in the current adapter/API. Existing replica layout/visual edits are supported; text replacement and primitive instance controls have narrower scopes. Create/move/delete are not implemented in this alpha, although public APIs exist. Independent-view content synchronization and animation editing are not implemented. Asset inspection covers references, not a complete library. CMS writes support existing user-managed scalar fields only.

Automated fixtures and real-editor acceptance are reported separately in [alpha acceptance](docs/ALPHA_ACCEPTANCE.md) and the [phase evidence](docs/PROJECT_PLAN.md). Native write acceptance remains pending explicit approval on a disposable project.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Protocol](docs/PROTOCOL.md)
- [Project plan and status](docs/PROJECT_PLAN.md) · [Alpha acceptance](docs/ALPHA_ACCEPTANCE.md)
- [Design workflows](docs/DESIGN_WORKFLOWS.md) · [Remote MCP proposal](docs/REMOTE_MCP.md)
- [Release and stable gates](docs/RELEASE.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

MIT licensed. See [LICENSE](LICENSE).
