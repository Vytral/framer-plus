import { createHash } from "node:crypto"
import {
  type DesignIR,
  type Diagnostic,
  designIRSchema,
  type IRNode,
  snapshotSchema,
  transformOptionsSchema,
} from "./schema.js"
/** Canonical object keys; array order retains actual design ordering. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(",")}}`
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export function toDesignIR(raw: unknown, rawOptions: unknown = {}): DesignIR {
  const snapshot = snapshotSchema.parse(raw)
  const options = transformOptionsSchema.parse(rawOptions)
  const input = new Map(snapshot.nodes.map((n) => [n.ref.id, n]))
  if (input.size !== snapshot.nodes.length)
    throw Error("Duplicate node IDs in snapshot")
  const sessions = new Set(
    snapshot.nodes
      .flatMap((n) => [
        n.ref.sessionId,
        ...(n.children ?? []).map((c) => c.sessionId),
        n.parent?.sessionId,
      ])
      .filter(Boolean),
  )
  if (sessions.size > 1) throw Error("Snapshot references span editor sessions")
  const root = input.get(snapshot.rootId)
  if (!root) throw Error("Snapshot root is missing")
  for (const key of Object.keys(options.roles))
    if (!input.has(key)) throw Error("Semantic role references a missing node")
  const diagnostics: Diagnostic[] = []
  const add = (
    code: string,
    message: string,
    nodeId?: string,
    severity: Diagnostic["severity"] = "unsupported",
  ) =>
    diagnostics.push({ code, message, severity, ...(nodeId ? { nodeId } : {}) })
  if (!snapshot.capture.complete)
    add(
      "INCOMPLETE_CAPTURE",
      "Capture is incomplete; missing nodes must not be silently dropped",
    )
  if (!snapshot.capture.verified)
    add(
      "UNVERIFIED_CAPTURE",
      "Capture was not checked for concurrent node changes",
    )
  const parents = new Map<string, string>()
  const visited = new Set<string>()
  const stack = new Set<string>()
  function visit(id: string, depth: number) {
    if (depth > 64) throw Error("Snapshot hierarchy exceeds depth limit")
    if (stack.has(id)) throw Error("Snapshot contains a hierarchy cycle")
    if (visited.has(id)) return
    const n = input.get(id)
    if (!n) {
      add("MISSING_NODE", "A referenced child was not captured", id)
      return
    }
    stack.add(id)
    for (const child of n.children ?? []) {
      if (parents.has(child.id) && parents.get(child.id) !== id)
        throw Error("Snapshot node has multiple parents")
      parents.set(child.id, id)
      visit(child.id, depth + 1)
    }
    stack.delete(id)
    visited.add(id)
  }
  visit(snapshot.rootId, 0)
  if (parents.has(snapshot.rootId))
    throw Error("Snapshot root must not be a descendant")
  const breakpoints = snapshot.breakpoints
    .map((b) => ({
      id: b.ref.id,
      name: b.name,
      width: b.width,
      primary: b.primary,
      inheritsFromId: b.inheritsFrom?.id ?? null,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  if (new Set(breakpoints.map((b) => b.id)).size !== breakpoints.length)
    throw Error("Duplicate breakpoint IDs")
  const primary = breakpoints.filter((b) => b.primary)
  if (breakpoints.length && primary.length !== 1)
    throw Error("A responsive page requires exactly one primary breakpoint")
  for (const b of breakpoints)
    if (!visited.has(b.id))
      add(
        "MISSING_BREAKPOINT",
        "A declared breakpoint frame was not captured",
        b.id,
      )
  const nodes: IRNode[] = []
  const tokenMap = new Map<string, DesignIR["tokens"][number]>()
  for (const n of snapshot.nodes
    .filter((n) => visited.has(n.ref.id))
    .sort((a, b) => (a.ref.id < b.ref.id ? -1 : 1))) {
    let current: string | undefined = n.ref.id
    let breakpointId: string | null = null
    while (current) {
      if (breakpoints.some((b) => b.id === current)) {
        breakpointId = current
        break
      }
      current = parents.get(current)
    }
    const role =
      (Object.hasOwn(options.roles, n.ref.id)
        ? options.roles[n.ref.id]
        : undefined) ??
      (n.ref.id === snapshot.rootId ? "main" : n.type === "text" ? "p" : "div")
    if (n.type === "text" && !["p", "h1", "h2", "h3", "div"].includes(role))
      throw Error("Text semantic role is incompatible")
    if (n.type !== "text" && ["p", "h1", "h2", "h3"].includes(role))
      throw Error("Heading and paragraph roles require text nodes")
    if (n.childrenTruncated)
      add("TRUNCATED_CHILDREN", "Child references were truncated", n.ref.id)
    if (n.text?.truncated)
      add("TRUNCATED_TEXT", "Text content is only a preview", n.ref.id)
    if (n.type === "text")
      add(
        "TYPOGRAPHY_UNAVAILABLE",
        "Effective node typography and rich inline formatting are unavailable; browser typography will be used unless implemented manually",
        n.ref.id,
      )
    if (["unknown", "component", "component-instance", "svg"].includes(n.type))
      add(
        "UNSUPPORTED_NODE",
        `${n.type} cannot be faithfully reconstructed by this exporter`,
        n.ref.id,
      )
    if (n.layout?.positioning && n.layout.positioning !== "flow")
      add(
        "POSITION_CONSTRAINTS_UNAVAILABLE",
        "Positioned layout has no captured pins/coordinates",
        n.ref.id,
      )
    if (n.layout?.kind === "grid")
      add(
        "GRID_TRACKS_UNAVAILABLE",
        "Grid track definitions are unavailable",
        n.ref.id,
      )
    if (n.metadata.isReplica)
      add(
        "INHERITANCE_UNKNOWN",
        "Effective replica values are preserved; per-property inheritance remains unknown",
        n.ref.id,
        "warning",
      )
    const color = n.visual?.background
    if (color?.kind === "style")
      tokenMap.set(`color:${color.id}`, {
        id: color.id,
        kind: "color",
        name: color.name,
        value: color.light,
        dark: color.dark,
        effective: true,
      })
    if (n.text?.style) {
      const s = n.text.style
      tokenMap.set(`text:${s.id}`, {
        id: s.id,
        kind: "text",
        name: s.name,
        value: s.fontSize,
        dark: null,
        effective: false,
      })
    }
    if (n.visual?.image) {
      try {
        const url = new URL(n.visual.image.url)
        if (url.protocol !== "https:" || url.username || url.password)
          throw Error()
      } catch {
        add(
          "UNSAFE_ASSET_URL",
          "Asset URL is not an uncredentialed HTTPS URL",
          n.ref.id,
        )
      }
    }
    nodes.push({
      id: n.ref.id,
      source: {
        nodeId: n.ref.id,
        framerType: n.metadata.framerType,
        originalId: n.metadata.originalId,
      },
      name: n.name ?? null,
      kind: n.type,
      children: (n.children ?? []).map((c) => c.id),
      layout: n.layout,
      visual: n.visual,
      text: n.text,
      role,
      semanticSource: Object.hasOwn(options.roles, n.ref.id)
        ? "explicit"
        : "default",
      breakpointId,
    })
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const signatures = new Map<string, string[]>()
  function shape(n: IRNode): unknown {
    return {
      kind: n.kind,
      role: n.role,
      layout: n.layout,
      children: n.children
        .map((id) => byId.get(id))
        .filter((v): v is IRNode => Boolean(v))
        .map(shape),
    }
  }
  for (const n of nodes.filter((n) => n.children.length > 0)) {
    const signature = hash(canonical(shape(n)))
    const ids = signatures.get(signature) ?? []
    ids.push(n.id)
    signatures.set(signature, ids)
  }
  return designIRSchema.parse({
    schemaVersion: 1,
    producerVersion: "0.1.0-alpha.1",
    project: snapshot.project,
    rootId: snapshot.rootId,
    nodes,
    breakpoints,
    tokens: [...tokenMap.values()].sort((a, b) =>
      `${a.kind}:${a.id}` < `${b.kind}:${b.id}` ? -1 : 1,
    ),
    reusable: [...signatures.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([signature, nodeIds]) => ({ signature, nodeIds }))
      .sort((a, b) => (a.signature < b.signature ? -1 : 1)),
    diagnostics: diagnostics.sort((a, b) =>
      canonical(a) < canonical(b) ? -1 : 1,
    ),
    capture: snapshot.capture,
  })
}
export function compareDesigns(before: DesignIR, after: DesignIR) {
  if (
    before.project.id !== after.project.id ||
    before.project.branchId !== after.project.branchId
  )
    throw Error("Comparison requires the same project and branch")
  const left = new Map(before.nodes.map((n) => [n.id, n]))
  const right = new Map(after.nodes.map((n) => [n.id, n]))
  return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap((id) =>
    canonical(left.get(id)) === canonical(right.get(id))
      ? []
      : [
          {
            nodeId: id,
            kind: !left.has(id)
              ? "added"
              : !right.has(id)
                ? "removed"
                : "changed",
          },
        ],
  )
}
