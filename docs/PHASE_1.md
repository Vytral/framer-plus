# Phase 1 — Plugin ↔ MCP Bridge

> Historical phase evidence is retained below. For the reconciled protocol-4 alpha, dated native observations, current test counts and unmet acceptance gates, see [Alpha acceptance](ALPHA_ACCEPTANCE.md). Earlier protocol versions/counts describe their original verification runs.


Implemented and accepted on 2026-10-02. Real editor pairing and MCP status
were verified.
Project inspection and mutation remain deferred to later phases.

## Decisions

- WSS over loopback, using the trusted mkcert certificate established in Phase 0.
  The HTTPS plugin cannot rely on insecure WebSocket browser behavior.
- One random credential per MCP run, saved to a private per-process connection
  file. Pairing is explicit; no unauthenticated credential-discovery endpoint.
- Exact origin allowlist, loopback remote-address validation, bounded payloads,
  bounded sockets, handshake timeout, and strict shared Zod schemas.
- Protocol version 1 is negotiated once. The application version remains 0.0.0.
- One UUID per plugin mount, retained over transport reconnections.
- Request/response envelopes and request IDs are implemented using connectivity
  ping RPC. A typed session-closing event is also defined. Arbitrary Framer API
  calls and selection/project transport are intentionally deferred.
- Native server ping/pong plus client application probes detect stale peers.
  Reconnection uses exponential delay with jitter capped at ten seconds.
- Session capabilities all remain false until corresponding design tools exist.
- `get_status` probes all sessions and never selects an arbitrary editor when
  multiple are connected. Disconnected and unresponsive sessions are removed.
- Stdio stdout contains only MCP protocol output; pairing paths and sanitized
  session lifecycle diagnostics use stderr. Tokens never appear in logs.

Framer's current documentation supports local development and HTTPS integrations,
but does not guarantee this specific localhost WSS workflow or every browser's
CSP behavior. The browser step must therefore be verified in the real editor.

Sources:

- [Framer Quick Start](https://www.framer.com/developers/plugins-quick-start)
- [Framer HTTPS integration example](https://www.framer.com/developers/oauth)
- [ws official transport documentation](https://github.com/websockets/ws/blob/master/doc/ws.md)

## Validation

- `pnpm check` passes lint, source/test typechecks, 21 tests, and all builds.
- Tests cover authenticated handshake, invalid token, incompatible version,
  malformed/binary/oversized messages, origin rejection, handshake deadline,
  request timeout, stale heartbeat, duplicate IDs, multi-session targeting,
  disconnection, real transport reconnection, RPC correlation and shutdown,
  plugin without MCP, and MCP without plugin.
- A real SDK client launched the compiled MCP process over stdio. The actual
  plugin `BridgeClient` connected to its WSS listener with CA verification.
  `get_status` returned false → true → false over the full stdio/WSS path.
- Pairing file permissions were verified as 0600. The credential was absent
  from captured stderr. MCP client closure removed the pairing file and stopped
  the listener.
- Automated bridge tests inject a local HTTP listener to avoid requiring system
  certificate installation on every clone. The separate WSS integration check
  used the existing local CA, without disabling TLS verification.

## Real-editor acceptance

The user paired the plugin in the real Framer project and confirmed **Connected**.
The same running MCP process was then initialized over stdio and received a real
`tools/call` for `get_status`. It returned:

```json
{
  "connected": true,
  "bridge": "listening",
  "protocolVersion": 1,
  "activeSessionId": "4e7f703c-d9aa-4692-b812-a8e8d3b00b9c"
}
```

The editor session was registered at `2026-10-02T17:43:00.259Z` and successfully
answered the status RPC at `2026-10-02T17:43:18.294Z`. This confirms the actual
Framer browser can reach the authenticated local WSS bridge with the existing
certificate setup. The full response also included session timestamps, plugin
version and truthful capabilities (all design tools still unavailable).

Disconnect/reconnect, server absence, timeout, bad credentials and version
mismatch are covered by automated client/real-transport tests. They were not all
manually repeated through the Framer UI. Phase 2 remains unimplemented.
