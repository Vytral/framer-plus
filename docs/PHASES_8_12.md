# Phases 8–12 implementation and acceptance

> Historical phase evidence is retained below. For the reconciled protocol-4 alpha, dated native observations, current test counts and unmet acceptance gates, see [Alpha acceptance](ALPHA_ACCEPTANCE.md). Earlier protocol versions/counts describe their original verification runs.


## Delivered locally

Phase 8: installation, pairing/client example and troubleshooting in README; contribution, architecture, security and changelog guidance; pinned-action CI and manually triggered alpha archive workflow; synthetic MIT fixtures; version 0.1.0-alpha.1. SECURITY.md was approved by the owner before writing. A private security reporting channel and independent newcomer onboarding are still acceptance work.

Phase 9: strict versioned snapshot and Design IR schemas, serializable transformation, graph validation, conservative explicit semantic roles, color/text token mapping, structural reuse candidates, replica provenance and unsupported diagnostics. Native frame widths do not establish media-query ranges or override inheritance. IR fixtures are synthetic; effective native typography and inheritance remain unavailable.

Phase 10: deterministic React/Vite project, source-based stable naming, section components, semantic tags, supported stack/flow conversion, explicit responsive ranges, color variables/dark values, HTTPS asset references, focus styling, heading-review diagnostics and unsupported-feature reports. Golden Page/CSS tests lock reviewed output. Unsupported content blocks unless explicitly acknowledged; the fixture deliberately acknowledges missing typography. Full real-page fidelity/accessibility is not certified.

Phase 11 selected scope: source mappings, structural same-project/branch comparison and baseline-driven regeneration into fresh directories. Compatible edits/unmanaged files survive; both-sides changes block before writing. No code reverse engineering, native code-component authoring, headless Server API or remote automation is implemented.

Phase 12 preparation: documented bridge contract, compatibility and migration policy, privacy decision (no hidden telemetry), maintainer review process, distribution/release gates and concrete alpha archive. Stable public release is not complete: no stable version, Marketplace submission, public publication or support SLA is claimed. See RELEASE.md for required native acceptance and ownership decisions.

## Validation on 2026-10-02

- Frozen workspace dependency installation passed.
- `pnpm check`: Biome, source/test strict TypeScript, 65 tests (40 plugin, 8 design, 17 MCP), and all builds passed.
- Actual MCP SDK/client and WebSocket integration exercised capture, inspect, blocked/acknowledged generation, comparison and regeneration against the fixture adapter.
- `pnpm verify:export` passed strict TypeScript and a production Vite build using pinned workspace dependencies.
- An isolated generated project also passed fresh `npm install --no-audit --no-fund` and `npm run build`.
- `pnpm release:prepare` produced a local alpha archive; its checksum, per-file digests and exclusion of credentials/symlinks passed. Extracting that archive into a fresh temporary directory, frozen pnpm installation and the full `pnpm check` also passed.
- A reviewable generated example is available locally at `build/examples/landing` (ignored build output).
- Artifact tests cover private permissions, identity/path rejection, altered snapshots/baselines, compatible edits, collisions and symlink rejection. Generated source escaping and root dimension validation are tested even for hand-authored IR.

These are local results, not GitHub CI results or native Framer acceptance. Prior real-editor pairing does not certify the new capture/export features. Read the diagnostics before using generated output. No screenshot/HTML scraping is used.

## Alpha reconciliation update (2026-10-04)

Current full suite passes 72 tests (47 plugin, 17 MCP, 8 design), source/test TypeScript, lint/format and all package builds. Generated fixture TypeScript/Vite verification also passed. README now leads with agent access, and detailed development flow lives in DEVELOPMENT.md. Protocol 4, native-versus-fixture acceptance, remaining stable gates and an unimplemented remote relay/Server API proposal are documented. Archive verification is automated in both CI and artifact workflows; publication and archive-install evidence are recorded separately in RELEASE_VERIFICATION.md. Phase 12 stable release and full native/export acceptance remain incomplete.
