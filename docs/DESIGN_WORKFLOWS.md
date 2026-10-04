# Design workflows

Build first: `pnpm build`. Offline synthetic example:

```sh
pnpm design ir fixtures/landing.snapshot.json /tmp/framer-plus-landing-ir.json fixtures/landing.roles.json
pnpm design react /tmp/framer-plus-landing-ir.json /tmp/framer-plus-landing fixtures/landing.options.json
cd /tmp/framer-plus-landing
npm install
npm run build
```

Use fresh paths: existing files/directories are never overwritten. The fixture options explicitly acknowledge unsupported typography and define Phone's maximum viewport width. Those ranges are human input, not inferred Framer inheritance. Inspect EXPORT_REPORT.md before using an export. Remote image URLs require connectivity and are not bundled; licensing and accessibility must be reviewed before publication.

With a connected editor, use `capture_design` (sessionId optional, maxNodes default 200/max 500, optional roles mapping). It returns a snapshot ID and diagnostics. `inspect_design_artifact` pages nodes using offset/limit (max 20). `generate_react` takes snapshotId and options; unsupported semantics block by default. `options.allowUnsupported: true` explicitly permits a partial result. `options.mode: responsive` requires a non-overlapping range for each non-primary breakpoint. Tool errors expose bounded diagnostics.

`compare_design_artifacts` accepts before/after snapshot IDs for the same project and branch. `regenerate_react` accepts previousExportId, snapshotId and options. Conflicts return file names and create no new project. Resolve a conflict deliberately in the source or user code, then retry; no merge is guessed. Successful output gets a new export ID/directory. Install its dependencies again: node_modules, dist and .git are not copied.

CLI equivalents:

```sh
pnpm design compare before-ir.json after-ir.json
pnpm design regenerate next-ir.json previous-project new-project options.json
```

Snapshot/IR/manifest schema 1 is alpha and runtime validated. Source IDs and component/class mappings are deterministic. Session tokens and SDK objects are excluded from IR. Snapshot hashes authenticate stored bytes; they are not a remote signing system. Never edit baseline manifests to suppress conflicts.
