# Alpha release verification

Version: 0.1.0-alpha.1. Verification date: 2026-10-04. Protocol: 4; snapshot/IR/generated manifest: 1.

- Frozen workspace installation passed with Node 24.16.0 and pnpm 12.8.1.
- Full `pnpm check` passed: Biome lint/format, strict source/test TypeScript, 72 tests (47 plugin, 17 MCP, 8 design), and every workspace package build.
- Plugin production Vite build and MCP TypeScript build passed.
- Generated React fixture TypeScript and production Vite build passed through `pnpm verify:export`.
- `pnpm release:prepare` and `pnpm release:verify` passed archive generation, SHA-256 checksum and per-file integrity, safe paths/types and credential/private artifact exclusions.
- A fresh temporary extraction passed frozen installation, the full 72-test `pnpm check`, all package builds and generated fixture TypeScript/Vite verification. Dependencies were actually installed in the extracted workspace; generated fixture verification then reused those exact installed dependencies.

GitHub CI and publication are separate from local checks; the release commit/tag and remote run/release results must be checked before claiming publication. Exact release notes live in RELEASE_NOTES_v0.1.0-alpha.1.md.

Native project inspection is dated separately in ALPHA_ACCEPTANCE.md. No actual native write acceptance is inferred from fixture tests or release builds.

GitHub checks passed on Node 22 and 24 for af146c4: https://github.com/Vytral/framer-plus/actions/runs/37243959680. The navigation-delay correction also passed the full local 72-test suite and generated build. Consult the latest GitHub run for its release-commit CI result.
