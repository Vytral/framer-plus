# Security

Framer+ is an experimental local tool. Only the latest alpha is maintained; there is no stable release yet.

## Trust boundaries

The agent talks to the MCP process over stdio. The Framer plugin connects to an authenticated loopback WSS bridge. Editor data, agent input, snapshots and generated files are untrusted inputs. Connection tokens and local TLS private keys must never be committed, printed in tool responses or included in release archives.

## Required invariants

- Bind the bridge to loopback; validate origins, tokens, message schemas and payload limits.
- Expose only named, validated operations. Never provide arbitrary SDK dispatch or execute editor-provided code.
- Bind mutations to the active project, branch, session and revisions. Require the plugin approval workflow for mutation plans; expire approvals and stop on failure.
- Bound traversal, requests and artifact reads. Reject unsafe paths and symlinks; never overwrite an existing export directory.
- Escape generated text and allow only supported CSS values and uncredentialed HTTPS image URLs. Do not download remote assets automatically.
- Preserve unknown or unsupported semantics as explicit diagnostics. Do not silently treat a partial export as faithful or a revision-checked capture as atomic.

## Reporting

Do not disclose credentials or unpublished project content in public issues. A private reporting contact has not yet been configured; maintainers must establish one before a public stable release. No vulnerability disclosure deadline or response SLA is promised by this alpha.

## Release acceptance

Automated tests and fixture builds do not replace real Framer editor acceptance. Stable release requires native acceptance, compatibility documentation, a private reporting channel and review of release artifacts. This policy defines no accepted vulnerabilities or finding exclusions.
