import { canonical, hash } from "./ir.js"
import {
  type Diagnostic,
  designIRSchema,
  exportOptionsSchema,
  type GeneratedManifest,
  generatedManifestSchema,
  type IRNode,
  RELEASE_VERSION,
} from "./schema.js"
export interface GeneratedProject {
  files: Record<string, string>
  manifest: GeneratedManifest
}
export class ExportBlocked extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(
      "Export contains unsupported design semantics; inspect diagnostics and explicitly acknowledge degraded output",
    )
  }
}
const slug = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "node"
const className = (n: IRNode) =>
  `fp-${slug(n.name ?? n.kind).toLowerCase()}-${hash(n.id).slice(0, 8)}`
const componentName = (n: IRNode) =>
  `Section${slug(n.name ?? n.kind)
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("")}${hash(n.id).slice(0, 8)}`
const js = (value: string) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
const cssQuote = (value: string) =>
  `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`
const safeColor = (value: string) =>
  /^#[a-f\d]{3,8}$/i.test(value) ||
  /^(?:rgba?|hsla?)\([\d\s.,%+-]+\)$/.test(value) ||
  value === "transparent"
const spacing = (value: string | null | undefined) =>
  value && /^-?\d+(?:\.\d+)?px(?: -?\d+(?:\.\d+)?px){0,3}$/.test(value)
    ? value
    : undefined
export function generateReact(
  raw: unknown,
  rawOptions: unknown = {},
): GeneratedProject {
  const ir = designIRSchema.parse(raw)
  const options = exportOptionsSchema.parse(rawOptions)
  const byId = new Map(ir.nodes.map((n) => [n.id, n]))
  if (byId.size !== ir.nodes.length) throw Error("Duplicate IR node IDs")
  const diagnostics: Diagnostic[] = [...ir.diagnostics]
  const warn = (code: string, message: string, nodeId?: string) =>
    diagnostics.push({ code, message, nodeId, severity: "unsupported" })
  const ensureUnsupported = (
    code: string,
    message: string,
    nodeId?: string,
  ) => {
    if (
      !diagnostics.some(
        (d) =>
          d.code === code &&
          d.nodeId === nodeId &&
          d.severity === "unsupported",
      )
    )
      warn(code, message, nodeId)
  }
  if (!ir.capture.complete)
    ensureUnsupported("INCOMPLETE_CAPTURE", "Capture is incomplete")
  if (!ir.capture.verified)
    ensureUnsupported("UNVERIFIED_CAPTURE", "Capture was not revision checked")
  if (
    ir.breakpoints.length &&
    ir.breakpoints.filter((b) => b.primary).length !== 1
  )
    throw Error("IR requires exactly one primary breakpoint")
  if (new Set(ir.breakpoints.map((b) => b.id)).size !== ir.breakpoints.length)
    throw Error("Duplicate IR breakpoint IDs")
  for (const n of ir.nodes) {
    if (n.kind === "text")
      ensureUnsupported(
        "TYPOGRAPHY_UNAVAILABLE",
        "Effective typography and rich formatting are unavailable",
        n.id,
      )
    if (["unknown", "component", "component-instance", "svg"].includes(n.kind))
      ensureUnsupported(
        "UNSUPPORTED_NODE",
        "Native component semantics are unavailable",
        n.id,
      )
    if (n.layout?.kind === "grid")
      ensureUnsupported(
        "GRID_TRACKS_UNAVAILABLE",
        "Grid tracks are unavailable",
        n.id,
      )
    if (n.layout?.positioning && n.layout.positioning !== "flow")
      ensureUnsupported(
        "POSITION_CONSTRAINTS_UNAVAILABLE",
        "Positioning coordinates are unavailable",
        n.id,
      )
    if (n.text?.truncated)
      ensureUnsupported("TRUNCATED_TEXT", "Text is truncated", n.id)
    if (
      (n.kind === "text" && !["p", "h1", "h2", "h3", "div"].includes(n.role)) ||
      (n.kind !== "text" && ["p", "h1", "h2", "h3"].includes(n.role))
    )
      throw Error("IR semantic role is incompatible with node kind")
  }
  const primary = ir.breakpoints.find((b) => b.primary)
  const root = byId.get(primary?.id ?? ir.rootId)
  if (!root) throw Error("Primary root is unavailable")
  const rootId = root.id
  const parents = new Map<string, IRNode>()
  const active = new Set<string>()
  const seen = new Set<string>()
  function validate(n: IRNode, depth: number) {
    if (depth > 64 || active.has(n.id))
      throw Error("IR graph is cyclic or too deep")
    if (seen.has(n.id)) return
    active.add(n.id)
    for (const id of n.children) {
      const c = byId.get(id)
      if (!c) throw Error("IR child is missing")
      if (parents.has(id) && parents.get(id)?.id !== n.id)
        throw Error("IR node has multiple parents")
      parents.set(id, n)
      validate(c, depth + 1)
    }
    active.delete(n.id)
    seen.add(n.id)
  }
  const page = byId.get(ir.rootId)
  if (!page) throw Error("IR page root is unavailable")
  validate(page, 0)
  const rendered = new Set<string>()
  function collect(n: IRNode) {
    rendered.add(n.id)
    for (const id of n.children) {
      const child = byId.get(id)
      if (child) collect(child)
    }
  }
  collect(root)
  const tokens = new Map(
    ir.tokens.filter((t) => t.kind === "color").map((t) => [t.id, t]),
  )
  const vars = new Map(
    [...tokens.keys()].map((id) => [id, `--color-${hash(id).slice(0, 12)}`]),
  )
  function rules(
    n: IRNode,
    parent?: IRNode,
    isRoot = false,
  ): Record<string, string> {
    const out: Record<string, string> = {}
    const l = n.layout
    if (l?.kind === "stack") {
      out.display = "flex"
      out["flex-direction"] = l.direction === "horizontal" ? "row" : "column"
      if (l.alignment)
        out["align-items"] = {
          start: "flex-start",
          center: "center",
          end: "flex-end",
        }[l.alignment]
      if (l.distribution) {
        const allowed: Record<string, string> = {
          start: "flex-start",
          center: "center",
          end: "flex-end",
          "space-between": "space-between",
          "space-around": "space-around",
          "space-evenly": "space-evenly",
        }
        if (Object.hasOwn(allowed, l.distribution))
          out["justify-content"] = allowed[l.distribution]
        else
          warn(
            "UNSUPPORTED_DISTRIBUTION",
            "Stack distribution is unsupported",
            n.id,
          )
      }
    }
    for (const property of [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
    ] as const) {
      const d = l?.[property]
      if (!d || d.raw === null) continue
      const css = property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
      if (
        d.mode === "fill" &&
        (property === "width" || property === "height")
      ) {
        const axis =
          parent?.layout?.kind === "stack" &&
          (parent.layout.direction === "horizontal" ? "width" : "height")
        if (axis === property) {
          out.flex = `${d.value ?? 1} 1 0`
          out[`min-${property}`] = "0"
        } else if (property === "width") {
          out.width = "100%"
        } else {
          warn(
            "FILL_CONTEXT_UNKNOWN",
            "Height fill has no supported flex parent context",
            n.id,
          )
        }
      } else if (d.mode === "fit-content") out[css] = "fit-content"
      else if (d.mode === "fit-image")
        warn(
          "INTRINSIC_IMAGE_SIZE_UNAVAILABLE",
          "Intrinsic image sizing is unavailable",
          n.id,
        )
      else if (/^-?\d+(?:\.\d+)?(?:px|%|vh)$/.test(d.raw)) out[css] = d.raw
      else
        warn(
          "UNSUPPORTED_DIMENSION",
          "Dimension cannot be represented safely",
          n.id,
        )
    }
    if (isRoot) {
      out.width = "100%"
      delete out.flex
      if (
        l?.width?.mode === "fixed" &&
        l.width.raw &&
        /^\d+(?:\.\d+)?px$/.test(l.width.raw)
      )
        out["max-width"] = l.width.raw
      out["margin-inline"] = "auto"
    }
    for (const k of ["gap", "padding"] as const) {
      const value = spacing(l?.[k])
      if (value) out[k] = value
      else if (l?.[k])
        warn(
          "UNSUPPORTED_SPACING",
          "Spacing is not a supported literal px value",
          n.id,
        )
    }
    if (l?.overflow) {
      if (["hidden", "visible", "clip", "scroll", "auto"].includes(l.overflow))
        out.overflow = l.overflow
      else warn("UNSUPPORTED_OVERFLOW", "Overflow value is unsupported", n.id)
    }
    if (n.visual?.opacity !== undefined)
      out.opacity = String(Math.min(1, Math.max(0, n.visual.opacity)))
    if (n.visual?.visible === false) out.display = "none"
    const color = n.visual?.background
    if (color?.kind === "literal") {
      if (safeColor(color.value)) out["background-color"] = color.value
      else
        warn(
          "UNSUPPORTED_COLOR",
          "Color literal cannot be emitted safely",
          n.id,
        )
    }
    if (color?.kind === "style") {
      const variable = vars.get(color.id)
      if (variable) out["background-color"] = `var(${variable})`
      else
        warn("MISSING_TOKEN", "Style binding refers to a missing token", n.id)
    }
    if (n.visual?.image) {
      try {
        const url = new URL(n.visual.image.url)
        if (url.protocol !== "https:" || url.username || url.password)
          throw Error()
        out["background-image"] = `url(${cssQuote(url.href)})`
        warn(
          "IMAGE_RENDERING_UNAVAILABLE",
          "Background image fit and focal position are unavailable; image sizing requires review",
          n.id,
        )
      } catch {
        warn("UNSAFE_ASSET_URL", "Image URL was omitted", n.id)
      }
    }
    return out
  }
  const baseRules = new Map<string, Record<string, string>>()
  for (const id of rendered) {
    const n = byId.get(id)
    if (n) baseRules.set(id, rules(n, parents.get(id), id === root.id))
  }
  const cssRule = (selector: string, values: Record<string, string>) =>
    `${selector} {\n${Object.entries(values)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n")}\n}`
  const css = [
    "/* Generated layout. Unsupported semantics are documented in EXPORT_REPORT.md. */",
    "* { box-sizing: border-box; }",
    "body { margin: 0; }",
    ":focus-visible { outline: 2px solid currentColor; outline-offset: 4px; }",
  ]
  const colorVars: Record<string, string> = {}
  const darkVars: Record<string, string> = {}
  for (const [id, t] of tokens) {
    const variable = vars.get(id)
    if (!variable) continue
    if (safeColor(t.value)) colorVars[variable] = t.value
    else warn("UNSUPPORTED_TOKEN", "Color token cannot be emitted safely")
    if (t.dark) {
      if (safeColor(t.dark)) darkVars[variable] = t.dark
      else
        warn("UNSUPPORTED_TOKEN", "Dark color token cannot be emitted safely")
    }
  }
  if (Object.keys(colorVars).length) css.push(cssRule(":root", colorVars))
  if (Object.keys(darkVars).length)
    css.push(
      `@media (prefers-color-scheme: dark) {\n${cssRule(":root", darkVars)}\n}`,
    )
  for (const id of [...rendered].sort()) {
    const n = byId.get(id)
    const value = baseRules.get(id)
    if (n && value) css.push(cssRule(`.${className(n)}`, value))
  }
  if (options.mode === "primary" && ir.breakpoints.length > 1)
    diagnostics.push({
      code: "PRIMARY_ONLY_EXPORT",
      severity: "warning",
      message:
        "Only the primary breakpoint is exported; responsive replicas remain in the IR",
    })
  if (options.mode === "responsive") {
    const expected = ir.breakpoints.filter((b) => !b.primary)
    const ranges = options.ranges
    if (
      ranges.length !== expected.length ||
      new Set(ranges.map((r) => r.breakpointId)).size !== ranges.length ||
      expected.some((b) => !ranges.some((r) => r.breakpointId === b.id))
    )
      throw Error(
        "Responsive export requires one explicit range per non-primary breakpoint",
      )
    for (const r of ranges)
      if (
        (r.minWidth === undefined && r.maxWidth === undefined) ||
        (r.minWidth ?? 0) > (r.maxWidth ?? Infinity)
      )
        throw Error("Invalid breakpoint range")
    for (let i = 0; i < ranges.length; i++)
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i]
        const b = ranges[j]
        if (
          a &&
          b &&
          Math.max(a.minWidth ?? 0, b.minWidth ?? 0) <=
            Math.min(a.maxWidth ?? Infinity, b.maxWidth ?? Infinity)
        )
          throw Error("Breakpoint ranges overlap")
      }
    for (const r of [...ranges].sort((a, b) =>
      a.breakpointId < b.breakpointId ? -1 : 1,
    )) {
      const replicaRoot = byId.get(r.breakpointId)
      if (!replicaRoot) throw Error("Responsive root is missing")
      const local = ir.nodes.filter((n) => n.breakpointId === r.breakpointId)
      const localToBase = new Map<string, string>()
      const used = new Set<string>()
      localToBase.set(replicaRoot.id, root.id)
      used.add(root.id)
      for (const n of local.filter((n) => n.id !== replicaRoot.id)) {
        let original = n.source.originalId
        const visited = new Set<string>()
        while (original && !rendered.has(original)) {
          if (visited.has(original)) {
            original = null
            break
          }
          visited.add(original)
          original = byId.get(original)?.source.originalId ?? null
        }
        if (!original || used.has(original)) {
          warn(
            "RESPONSIVE_STRUCTURE_UNRESOLVED",
            "Replica has no unique primary mapping",
            n.id,
          )
          continue
        }
        localToBase.set(n.id, original)
        used.add(original)
      }
      if ([...rendered].some((id) => !used.has(id)))
        warn(
          "RESPONSIVE_STRUCTURE_UNRESOLVED",
          "Replica tree omits primary nodes; absence cannot be assumed hidden",
          replicaRoot.id,
        )
      const blocks = []
      for (const n of local) {
        const baseId = localToBase.get(n.id)
        const base = baseId ? byId.get(baseId) : undefined
        if (!base) continue
        const mappedChildren = n.children.map((id) => localToBase.get(id))
        if (canonical(mappedChildren) !== canonical(base.children))
          warn(
            "RESPONSIVE_STRUCTURE_UNRESOLVED",
            "Responsive child ordering or structure differs",
            n.id,
          )
        if (n.text?.content !== base.text?.content)
          warn(
            "RESPONSIVE_TEXT_DIFFERENCE",
            "Different responsive text cannot be implemented as a CSS rule",
            n.id,
          )
        const effective = rules(n, parents.get(n.id), n.id === replicaRoot.id)
        const primaryValues = baseRules.get(base.id) ?? {}
        const reset: Record<string, string> = {}
        for (const key of Object.keys(primaryValues))
          if (!(key in effective)) reset[key] = "initial"
        blocks.push(cssRule(`.${className(base)}`, { ...reset, ...effective }))
      }
      const query = [
        ...(r.minWidth !== undefined ? [`(min-width: ${r.minWidth}px)`] : []),
        ...(r.maxWidth !== undefined ? [`(max-width: ${r.maxWidth}px)`] : []),
      ].join(" and ")
      css.push(`@media ${query} {\n${blocks.join("\n")}\n}`)
    }
  }
  const files: Record<string, string> = {}
  const boundaries = new Map<string, string>()
  for (const id of root.children) {
    const n = byId.get(id)
    if (n && ["frame", "stack"].includes(n.kind) && n.children.length)
      boundaries.set(id, componentName(n))
  }
  const sources: GeneratedManifest["sources"] = []
  function render(
    n: IRNode,
    owner: string,
    depth: number,
    entry = false,
  ): string {
    const indent = "  ".repeat(depth)
    const component = boundaries.get(n.id)
    if (component && !entry) return `${indent}<${component} />`
    const tag = n.id === rootId ? "main" : n.role
    const content = n.text?.content
    const placeholder = [
      "component",
      "component-instance",
      "unknown",
      "svg",
    ].includes(n.kind)
    sources.push({
      nodeId: n.id,
      file: `src/${owner}.tsx`,
      component: owner,
      className: className(n),
    })
    if (n.kind === "text")
      return `${indent}<${tag} className=${js(className(n))}>{${js(content ?? "")}}</${tag}>`
    const children = n.children
      .map((id) => byId.get(id))
      .filter((c): c is IRNode => Boolean(c))
      .map((c) => render(c, owner, depth + 1))
      .join("\n")
    return `${indent}<${tag} className=${js(className(n))}${placeholder ? ' aria-label="Unsupported design element"' : ""}>${placeholder ? `\n${indent}  {/* Unsupported ${n.kind}; see EXPORT_REPORT.md. */}` : ""}${children ? `\n${children}\n${indent}` : ""}</${tag}>`
  }
  for (const [id, name] of boundaries) {
    const n = byId.get(id)
    if (n)
      files[`src/${name}.tsx`] =
        `export function ${name}() {\n  return (\n${render(n, name, 2, true)}\n  )\n}\n`
  }
  const imports = [...boundaries.values()]
    .sort()
    .map((name) => `import { ${name} } from "./${name}"`)
    .join("\n")
  files["src/Page.tsx"] =
    `${imports}${imports ? "\n" : ""}import "./styles.css"\n\nexport function Page() {\n  return (\n${render(root, "Page", 2, true)}\n  )\n}\n`
  files["src/styles.css"] = `${css.join("\n\n")}\n`
  files["src/main.tsx"] =
    'import { StrictMode } from "react"\nimport { createRoot } from "react-dom/client"\nimport { Page } from "./Page"\n\nconst root = document.getElementById("root")\nif (!root) throw new Error("Missing app root")\ncreateRoot(root).render(<StrictMode><Page /></StrictMode>)\n'
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  files["index.html"] =
    `<!doctype html>\n<html lang="en">\n  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(options.title)}</title></head>\n  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>\n`
  files["package.json"] = `${JSON.stringify(
    {
      name: "framer-export",
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        typecheck: "tsc --noEmit",
        build: "tsc --noEmit && vite build",
      },
      dependencies: { react: "18.3.1", "react-dom": "18.3.1" },
      devDependencies: {
        "@types/react": "18.3.24",
        "@types/react-dom": "18.3.7",
        typescript: "5.9.3",
        vite: "7.3.6",
      },
    },
    null,
    2,
  )}\n`
  files["tsconfig.json"] = `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        isolatedModules: true,
      },
      include: ["src"],
    },
    null,
    2,
  )}\n`
  files["README.md"] =
    "# Generated React project\n\nRun `npm install`, then `npm run build` or `npm run dev`.\n\nInspect EXPORT_REPORT.md before using this output. Source mappings and managed-file hashes live in .framer-plus.json. Add application behavior manually; forms, accounts, payments and interactions are not synthesized.\n"
  const headings = [...rendered]
    .map((id) => byId.get(id))
    .filter((n) => n?.role === "h1")
  if (headings.length !== 1)
    diagnostics.push({
      code: "HEADING_REVIEW",
      severity: "warning",
      message:
        "Provide exactly one explicit h1 role and review heading order/accessibility",
    })
  diagnostics.sort((a, b) => (canonical(a) < canonical(b) ? -1 : 1))
  if (
    !options.allowUnsupported &&
    diagnostics.some((d) => d.severity === "unsupported")
  )
    throw new ExportBlocked(diagnostics)
  files["EXPORT_REPORT.md"] =
    `# Export report\n\nGenerator ${RELEASE_VERSION}; IR ${hash(canonical(ir))}.\n\n${options.allowUnsupported ? "Unsupported output was explicitly acknowledged. Review all limitations below." : "No unsupported diagnostics were accepted."}\n\n${diagnostics.map((d) => `- ${d.severity}: ${d.code}${d.nodeId ? ` (${d.nodeId.replace(/[\r\n]/g, " ")})` : ""}: ${d.message}`).join("\n")}\n\nThis export preserves supported structure and effective values; it is not a pixel-fidelity or inheritance-source guarantee. Remote images remain remote references. No assets are downloaded or executed during generation.\n`
  const manifest = generatedManifestSchema.parse({
    schemaVersion: 1,
    generatorVersion: RELEASE_VERSION,
    irHash: hash(canonical(ir)),
    projectId: ir.project.id,
    branchId: ir.project.branchId,
    options,
    files: Object.fromEntries(
      Object.entries(files).map(([path, content]) => [path, hash(content)]),
    ),
    sources: sources.sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1)),
    diagnostics,
  })
  files[".framer-plus.json"] = `${JSON.stringify(manifest, null, 2)}\n`
  return {
    files: Object.fromEntries(
      Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    manifest,
  }
}
