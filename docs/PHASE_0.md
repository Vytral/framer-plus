# Phase 0 — Foundation

> Historical phase evidence is retained below. For the reconciled protocol-4 alpha, dated native observations, current test counts and unmet acceptance gates, see [Alpha acceptance](ALPHA_ACCEPTANCE.md). Earlier protocol versions/counts describe their original verification runs.


Implemented and accepted on 2026-10-02. The user authorized Phase 1 after
confirming that the plugin works in the real editor.

## Scaffold audit

The current official Framer Quick Start uses `@framer/plugin`. The published
`create-framer-plugin@1.5.1` canvas starter uses React 18, `framer.showUI`,
selection subscriptions, `vite-plugin-framer`, and `vite-plugin-mkcert`.
Framer+ now follows those integration points. The `canvas` mode is retained;
the icon now lives in `public` and the manifest references `/icon.svg`.
The manifest ID is a six-character hexadecimal identifier, matching the
official starter generator and Framer editor validation.
Vite 7 is retained rather than upgrading unrelated bundler infrastructure; the
Framer Vite integration supports it. The existing pnpm 12.8.1 pin is preserved.

Sources:

- [Official Quick Start](https://www.framer.com/developers/plugins-quick-start)
- [Official configuration](https://www.framer.com/developers/configuration)
- [Official modes](https://www.framer.com/developers/modes)
- [Published starter](https://www.npmjs.com/package/create-framer-plugin/v/1.5.1)

## Verified

- `pnpm install --frozen-lockfile` succeeds.
- `pnpm peers check` reports no issues.
- `pnpm check` passes formatting/lint, all four package typechecks and builds.
- A real SDK client initializes the compiled MCP process over stdio, lists
  `get_status`, and calls it successfully with no stderr output.
- The plugin HTTPS development server starts. Its HTML, transformed TypeScript,
  manifest and icon return successfully with TLS verification against its CA.
- The plugin production build contains the manifest and public icon.

## Editor acceptance

The user installed the local CA in macOS and successfully opened Framer+ in
**Nyro Portfolio website (copy)**. The supplied screenshot shows **Plugin ready.**
and **Current selection: 3**, confirming UI loading and a real selection callback.
Framer initially rejected the scaffold ID because it was not exactly six
characters; this was corrected to match the official starter generator.
