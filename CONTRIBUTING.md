# Contributing

Use Node >=22.19 and the pnpm version pinned in package.json. Run `pnpm install --frozen-lockfile`, then `pnpm check` and `pnpm verify:export`. Keep heavy checks serial.

Read docs/ARCHITECTURE.md and docs/PROJECT_PLAN.md before changing contracts. Protocol inputs and outputs need runtime schemas, bounded responses and tests. Never add arbitrary SDK dispatch, scrape rendered HTML, log tokens, or silently infer unavailable native semantics. Preserve project/branch/session/revision preconditions for writes. Fixtures are synthetic and may not establish real Framer behavior.

Describe the problem, resulting behavior, validation and remaining runtime limitations in pull requests. Add a CHANGELOG.md entry for user-visible changes. Follow existing TypeScript/Biome style. Avoid unrelated cleanup. Maintainers review and merge changes; contributor governance is currently this review process. Maintainer identities and support commitments must be established before stable release.

Local checks cannot certify editor acceptance. For native tests, use a disposable Framer project, record SDK/plugin/protocol versions and before/after state, and never include unpublished content or credentials in reports.
