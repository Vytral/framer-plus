# Releases and compatibility

Current version: 0.1.0-alpha.1. This is a local development alpha, not a certified stable release. Supported development environment: Node >=22.19, pinned pnpm, Framer plugin SDK 5.1.0, protocol 4 and snapshot/IR/manifest schema 1. CI checks Node 22/24 on Ubuntu; real Framer acceptance is separate. Generated applications use React 18.3.1, TypeScript 5.9.3 and Vite 7.3.6.

Restart MCP and reload the plugin together after bridge upgrades. Re-pair using the newly generated connection file. Do not mix protocol versions or assume old IR schemas can migrate silently; retain originals and capture again. No migration converter or public compatibility promise exists yet.

Run `pnpm check`, `pnpm verify:export`, then `pnpm release:prepare` and `pnpm release:verify`. The last command creates build/releases/framer-plus-0.1.0-alpha.1.tar.gz, a SHA256 sidecar and an internal per-file RELEASE_MANIFEST.json. It includes source and compiled workspace output but excludes node_modules, environment files, TLS keys and pairing files. The archive is a source alpha bundle: installation still requires pnpm and dependencies. Inspect before distribution. Timestamped archives are not claimed byte-reproducible.

GitHub Actions runs checks and fixture builds. The manual Alpha artifact workflow produces a downloadable archive, not a GitHub Release or Marketplace publication. Local verification does not prove remote CI; consult GitHub run results for the release commit. Marketplace packaging, signing and listing need evaluation against current Framer requirements before submission.

Stable release gates:

- Recorded native editor acceptance of inspection, session recovery, mutation approval and branch/revision preconditions.
- Proven responsive behavior; unavailable override/inheritance operations must remain explicitly unsupported.
- Representative real-page export review for semantics, assets, accessibility and partial diagnostics.
- CI passes, clean installation from release archive and reviewed compatibility/migration policy.
- Confirmed maintainer ownership and private security reporting channel.
- Explicit distribution decision and release authorization.

No hidden telemetry is implemented. Adding telemetry requires an explicit documented decision and consent model. Stable version numbers and support SLAs must follow evidence, not the number of completed implementation phases.

## Exact remaining gates before 1.0

1. Native disposable-project acceptance: text/layout/visual edits, explicit Tablet/Phone edits with Desktop preserved, instance controls, style bindings, CMS patches and mixed cross-page plans; verify readback, stale revisions, permissions, branch/session changes, expiry/rejection, reconnect and partial/uncertain outcomes. Never substitute fixtures for native acceptance.
2. Complete independently structured responsive-view content synchronization: inspect explicit correspondence, distinguish replicas from independent nodes, review multi-target text changes and preserve untouched views. Current alpha text mutations are base-only; automatic matching/synchronization and animation editing are not implemented. Then complete the supported create/move/delete tool safety model and disposable-project tests. Asset insertion/replacement and broader CMS fields require separately scoped design/acceptance.
3. Establish an explicit stable subset for API-limited responsive provenance/reset, font-size and selected component variants; revise acceptance scenarios to attainable public semantics or wait for API support. Never simulate unsupported reset.
4. Independently verify fresh-client onboarding, Framer distribution/Marketplace requirements and supported editor/browser/OS combinations.
5. Review real representative export output, accessibility and unsupported-feature handling; test large-site pagination, response budgets and collaborator races.
6. Freeze a documented protocol/IR compatibility window, migration strategy, regression fixtures and supported dependency matrix; maintain green release CI and archive installation checks.
7. Confirm maintainer ownership, private security reporting, release/support policy and vulnerability response responsibilities. No stable SLA is promised today.

Cloud hosting is a separate optional architecture with its own authentication/privacy acceptance gates; it is not needed to make the local product stable. No production cloud service is included in this release.
