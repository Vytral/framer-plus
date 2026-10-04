# Bridge contract (alpha)

Protocol version 4 is implemented by packages/protocol/src/messages.ts and schemas/commands.ts. These runtime schemas are the authoritative contract, including optional fields, enums and byte limits. This document does not promise a stable public protocol yet.

The plugin opens `/bridge` on the loopback WSS listener with an allowed exact HTTPS origin. Within five seconds it sends a strict `hello` object containing kind, numeric protocolVersion, client `framer-plugin`, clientVersion, UUID sessionId, 64-hex token and capability booleans. The server replies with `welcome` (version/session/capabilities) or `rejected` (structured error). Duplicate live identities, bad credentials or mismatched versions are rejected. Secrets belong only in handshake/pairing memory and private connection files.

After negotiation, strict request/response envelopes correlate IDs. Named methods validate both params and results; response errors contain code/message/retryable. Late responses are ignored. Disconnect rejects pending requests. Messages are limited to 64 KiB; design requests default to 15-second deadlines. Heartbeats remove inactive sessions. Current capabilities are permission-aware and never guarantee every property is supported.

References carry editor session identity. Multiple live editors require explicit targeting. Cursors and mutation revisions are scoped to source context. Mutations validate all preconditions before native writes. A write timeout or failed readback may mean unknown outcome: never automatically retry. Change plans are bounded, expire, require exact plugin approval and serialize writes; partial failures stop without rollback.

The five design artifact tools are MCP-local orchestration of existing read methods and filesystem generation; they add no arbitrary bridge dispatch. Snapshot/IR/manifest version 1 is independent of bridge version 4. Artifact response size is capped at 48 KiB with bounded node/diagnostic pages.

For migration, restart MCP and reload the plugin together, then re-pair. Unsupported protocol versions are rejected rather than coerced. There is no stable backwards compatibility window or implicit IR migration; see RELEASE.md.

## Agent discovery and planning

There are 33 MCP tools: status, 27 editor tools and five design tools. Start with get_status for live session selection, get_project for project/active canvas, get_branch for branch context, and get_pages for web/design page references. Page/style/component/CMS lists return nextOffset; tree traversal returns an opaque cursor plus depth-boundary roots. Lists are live observations, not stable pagination snapshots. References include session identity; use returned IDs rather than names as keys.

Protocol 4 adds page enumeration and extends reviewed plan operations beyond nodes. A plan contains up to ten distinct targets with required revisions: base node patches, explicit breakpoint replica patches, instance controls, existing style bindings or scalar CMS patches. Preview entries include page/breakpoint context and current values. CMS entries use collection/item IDs without invented node references. Approval is bound to exact operations, project, branch and session, expires after five minutes, and is consumed once.

Execution preflights every target before the first write, serializes writes, verifies each result and stops on failure. Batch outcomes distinguish verified/failed/skipped; MUTATION_RESULT_UNKNOWN means a failed verification may conceal an applied native write. It must never trigger automatic replay. No distributed transaction or guaranteed collaborator exclusion is claimed. Direct tools remain single-target operations; agents should use plans for broad changes.

Errors include actionable codes for missing/ambiguous sessions, stale revisions, expired cursors/plans, permissions and unsupported scopes. Re-inspect after context change; reconnect and re-pair after process restart. Do not retry uncertain writes. Unsupported reset tools are discoverable and return explicit errors rather than simulated restoration.

`open_page` explicitly navigates to a discovered web page with expectedCanvas from a fresh project read. It verifies project/branch/canvas context and invalidates cursors and previous plan approvals. It does not mutate design content. Inspect again and prepare a new per-page plan after navigation; the current executor does not silently switch pages in a cross-page batch.
