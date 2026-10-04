# Framer+ v0.1.0-alpha.1

Experimental alpha software. Framer+ gives AI agents structured access to real Framer projects through MCP. It does not promise stable compatibility, complete native acceptance or full-fidelity export.

## Highlights

- Authenticated local Framer plugin ↔ MCP bridge, with 33 semantic tools.
- Cross-page discovery, explicit web-page navigation and bounded hierarchy inspection with scoped identifiers, revisions and continuation.
- Reviewed plans combining up to ten targets across pages, responsive views, instance controls, styles and CMS.

## MCP capabilities

Inspect the project, active canvas/branch, pages, selection, nodes, supported text/layout/visual properties, breakpoints, component definitions/instances, reusable styles, referenced assets and CMS schemas/items. Prepare exact plans with current/requested values and page/view context. Tool descriptions and parameter descriptions explain scope and limitations.

## Responsive editing

Existing non-primary replicas support allowlisted layout/visual edits with explicit target/breakpoint references and primary-node verification. Fixture tests verify Phone isolation. A native breakpoint classification issue was corrected: page breakpoint frames may expose both variant and breakpoint flags.

## Components / styles / CMS

Supported writes include existing primitive controls on compatible base instances, linking existing color/text styles and patching existing user-managed CMS string/number/boolean fields. A CMS record and card layout can share a plan; their association must be inspected explicitly.

## Design IR and React export

Semantic inspection feeds schema-1 snapshots/Design IR, deterministic React/Vite generation, explicit responsive ranges, source mappings, comparison and conflict-aware regeneration into fresh directories. Unknown/unsupported features remain diagnostics. Export is a supporting capability of agent access.

## Safety model

Authenticated loopback WSS, exact allowed origins, strict protocol-4 schemas, bounded messages, timeouts and live session probes. Writes enforce supported scopes, permissions, context and revision checks with readback. Reviewed plans require exact in-editor approval, expire and execute once. Operations are sequential, not atomic; failures/uncertain outcomes stop later writes without automatic retry or rollback. Single-target direct mutation tools also exist.

## Known limitations

- Responsive per-property override provenance/reset, isolated node font-size writes and selected instance variant axes/reset are unavailable in the current public adapter/API.
- Automatic content synchronization between independent responsive views and animation editing are not implemented; text writes are base-only.
- Create/move/delete, asset insertion/replacement, shared style editing, complex/localized CMS mutations and branch lifecycle tools are not implemented in this alpha.
- Native compare-and-set/atomic transactions are unavailable; fingerprints cannot eliminate collaborator races.
- 72 automated tests and fixture builds pass. Real-editor project/page/node/style reads were observed; native mutation acceptance is incomplete. Home hierarchy and three-view/resource inspections were verified read-only; non-active-page lookup restrictions require explicit page navigation. Projects → Blog → Home navigation, Blog inspection/planning and plan revocation on leaving the page were also verified. No portfolio writes were made for release acceptance.
- Full export fidelity/accessibility, Marketplace distribution and stable compatibility are not certified. Remote MCP and Server API integration are researched proposals, not shipped services.

## Installation / development status

This is a source alpha bundle with compiled workspace output, not a one-click Marketplace or registry distribution. Use Node 22.19+ and pinned pnpm 12.8.1: install with `pnpm install --frozen-lockfile`, validate with `pnpm check`, start `pnpm dev:plugin`, and configure your MCP client to launch `node /absolute/path/apps/mcp/dist/index.js`. Open the development plugin in Framer, then pair using the private connection file printed to stderr. Never share its contents.

Reload the plugin and restart/re-pair MCP together when upgrading from earlier development protocols. See README and docs/DEVELOPMENT.md for certificate setup and client examples; docs/ALPHA_ACCEPTANCE.md records evidence and docs/RELEASE.md lists stable gates.

The attached archive has an internal per-file SHA-256 manifest and a checksum sidecar. Release verification rejects private TLS material, pairing files, environment files, local assistant settings and nested development archives.
