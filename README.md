<div align="center">

# Framer+

### Let your agents play with your Framer designs.

Open-source tooling that gives AI agents structured access to Framer projects through MCP.

[Getting Started](#getting-started) · [Roadmap](#roadmap) · [License](#license)

</div>

---

## What is Framer+?

Framer+ is an open-source bridge between Framer and AI agents.

The goal is to let agents understand and work with real Framer projects instead of treating them like flattened HTML.

The first milestone focuses on:

- inspecting the current Framer project
- reading the active selection
- traversing the node tree
- understanding responsive layouts and overrides
- safely updating supported nodes through MCP

Later, Framer+ will explore a structured design representation that can be used to generate clean, maintainable code such as React instead of raw exported markup.

## Architecture

```text
Framer Editor
    │
    ▼
Framer+ Plugin
    │
    ▼
Shared Protocol
    │
    ▼
Framer+ MCP Server
    │
    ▼
AI Agent
```

The project is intentionally split so editor-specific code, MCP transport and the shared design model can evolve independently.

## Repository

```text
apps/
  plugin/      Framer editor plugin
  mcp/         MCP server

packages/
  core/        Framer+ domain model
  protocol/    Shared schemas and messages
```

## Getting Started

Framer+ is currently in early development.

Requirements:

- Node.js 20+
- pnpm
- Framer desktop or web editor with Developer Tools enabled

Install dependencies:

```bash
pnpm install
```

Run the plugin:

```bash
pnpm dev:plugin
```

Run the MCP server:

```bash
pnpm dev:mcp
```

## Roadmap

### MVP

- [ ] Connect the Framer plugin to the MCP server
- [ ] Read project metadata
- [ ] Read the current selection
- [ ] Traverse the node tree
- [ ] Expose stable node identifiers
- [ ] Read responsive layout information
- [ ] Apply safe node updates
- [ ] Add basic validation and error reporting

### Later

- [ ] Components and variants
- [ ] CMS support
- [ ] Assets and design tokens
- [ ] Branch-aware editing
- [ ] Design snapshots for agents
- [ ] Canonical design representation
- [ ] Clean React export
- [ ] Additional code generators

## Principles

Framer+ should prefer structured design data over generated markup.

Agents should be able to reason about pages, components, layout, breakpoints and intent instead of reverse-engineering opaque HTML.

Changes should also be explicit, inspectable and safe by default.

## License

MIT © Vytral
