import type {
  Breakpoint,
  DesignNode,
  NodeRef,
  NodeType,
} from "@framer-plus/core"
import {
  BRIDGE_CAPABILITIES,
  BridgeError,
  inputSchemas,
  type Method,
  type MutationPatch,
  mutationPatchSchema,
  type RequestContext,
  type RpcResult,
  WRITE_METHODS,
} from "@framer-plus/protocol"
import {
  dimension,
  type EditableAttributes,
  type EditorApi,
  type EditorNode,
  ref,
} from "./api.js"

type Include = Array<"layout" | "visual" | "text">

import { ProjectOperations } from "./project-operations.js"

type Walk = {
  root: NodeRef
  canvasId: string
  frontier: Array<{ id: string; depth: number }>
  seen: Set<string>
  depth: number
  include: Include
  expiresAt: number
}
const RESULT_BUDGET = 48 * 1024
const MAX_FRONTIER = 2_000
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength
const editableKinds = new Set(["FrameNode", "TextNode", "SVGNode"])
const allIncludes: Include = ["layout", "visual", "text"]

/** Maps documented SDK data into bounded, transport-safe design operations. */
export class EditorAdapter {
  private readonly cursors = new Map<string, Walk>()
  private mutations: Promise<unknown> = Promise.resolve()
  readonly projectOperations: ProjectOperations
  constructor(
    private readonly api: EditorApi,
    readonly sessionId: string,
  ) {
    this.projectOperations = new ProjectOperations(api, sessionId, {
      resolve: (r) => this.resolve(r),
      snapshot: (n) => this.snapshot(n),
      ancestors: (n) => this.ancestors(n),
      guard: (c) => this.guard(c),
      mutate: (op, c, dryRun) =>
        this.mutate(
          op.node,
          op.changes,
          op.expected.revision,
          op.breakpoint,
          c,
          dryRun,
        ),
    })
  }

  capabilities() {
    return {
      ...BRIDGE_CAPABILITIES,
      componentRead: Boolean(this.api.project),
      componentWrite: Boolean(this.api.project) && this.api.canSetAttributes(),
      cmsRead: Boolean(this.api.project),
      cmsWrite: this.api.project?.canSetCms() ?? false,
      branchSupport: Boolean(this.api.project),
      nodeWrite: this.api.canSetAttributes() || this.api.canSetText(),
      responsiveWrite: this.api.canSetAttributes(),
    }
  }
  private guard(context: RequestContext): void {
    if (context.signal.aborted)
      throw new BridgeError(
        "SESSION_DISCONNECTED",
        "Request cancelled before execution",
        false,
      )
    if (Date.now() >= context.deadlineAt)
      throw new BridgeError(
        "BRIDGE_TIMEOUT",
        "Request deadline expired before execution",
        false,
      )
  }
  private checkRef(node: NodeRef): void {
    if (node.sessionId && node.sessionId !== this.sessionId)
      throw new BridgeError(
        "INVALID_REQUEST",
        "Node reference belongs to another editor session",
        false,
      )
  }
  private async resolve(node: NodeRef): Promise<EditorNode> {
    this.checkRef(node)
    const found = await this.api.getNode(node.id)
    if (!found)
      throw new BridgeError(
        "NODE_NOT_FOUND",
        "Node is missing or not resolvable in the current canvas. Inspect pages and open the intended page before retrying a read.",
        false,
      )
    return found
  }
  private type(node: EditorNode): NodeType {
    switch (node.framerType) {
      case "WebPageNode":
      case "DesignPageNode":
        return "page"
      case "ComponentNode":
        return "component"
      case "ComponentInstanceNode":
        return "component-instance"
      case "TextNode":
        return "text"
      case "SVGNode":
        return "svg"
      case "FrameNode":
        return node.layout?.kind === "stack" ? "stack" : "frame"
      default:
        return "unknown"
    }
  }
  private async ancestors(
    node: EditorNode,
    cache = new Map<string, EditorNode[]>(),
  ): Promise<EditorNode[]> {
    const path: EditorNode[] = []
    const seen = new Set<string>()
    let current: EditorNode | null = node
    while (current) {
      if (seen.has(current.id) || path.length >= 64)
        throw new BridgeError(
          "TREE_LIMIT_REACHED",
          "Ancestor chain is cyclic or exceeds the inspection limit",
          false,
        )
      seen.add(current.id)
      const cached = cache.get(current.id)
      if (cached) {
        path.push(...cached)
        break
      }
      path.push(current)
      current = await current.readParent()
    }
    for (let index = 0; index < path.length; index++)
      cache.set(path[index]?.id ?? "", path.slice(index))
    return path
  }
  private properties(node: EditorNode): string[] {
    if (!editableKinds.has(node.framerType)) return []
    const attributes = this.api.canSetAttributes() ? ["name"] : []
    if (this.api.canSetAttributes() && node.layout?.width !== undefined)
      attributes.push("layout.width", "layout.height")
    if (this.api.canSetAttributes() && node.visual?.opacity !== undefined)
      attributes.push("visual.opacity")
    if (this.api.canSetAttributes() && node.framerType === "FrameNode") {
      attributes.push("visual.backgroundColor")
      if (node.layout?.kind === "stack" || node.layout?.kind === "grid")
        attributes.push("layout.gap", "layout.padding")
      if (node.layout?.kind === "stack") attributes.push("layout.alignment")
    }
    if (this.api.canSetText() && node.readText && node.setText)
      attributes.push("text.content")
    return attributes
  }
  private async snapshot(
    node: EditorNode,
    include = allIncludes,
    cache = new Map<string, EditorNode[]>(),
    relationships = true,
  ): Promise<DesignNode> {
    const lineage = await this.ancestors(node, cache)
    const parent = lineage[1]
    const children = relationships ? await node.readChildren() : []
    const fullText =
      node.readText && relationships ? await node.readText() : undefined
    const warnings: string[] = []
    const restricted = lineage.some(
      (item) =>
        item.locked ||
        (item.isVariant && !item.isBreakpoint) ||
        item.framerType === "ComponentNode",
    )
    if (restricted)
      warnings.push(
        "Write access is blocked by locked ancestry or a component definition/variant. Inspect ancestor metadata before planning.",
      )
    const breakpoint = lineage.find((item) => item.isBreakpoint)
    const replicaContext =
      lineage.some((item) => item.isReplica) ||
      (breakpoint !== undefined && !breakpoint.isPrimaryBreakpoint)
    const properties = restricted ? [] : this.properties(node)
    const breakpointProperties =
      node.isReplica &&
      node.originalId &&
      breakpoint &&
      !breakpoint.isPrimaryBreakpoint &&
      !restricted
        ? properties.filter(
            (property) => property !== "name" && property !== "text.content",
          )
        : []
    if (this.type(node) === "unknown")
      warnings.push(
        "Unsupported Framer node type; represented without inventing semantics.",
      )
    if (children.length > 200)
      warnings.push(
        "Child references are truncated; use bounded tree continuation.",
      )
    if ((node.name?.length ?? 0) > 512)
      warnings.push("Node name is truncated in this snapshot.")
    if (fullText !== undefined && fullText !== null && fullText.length > 4096)
      warnings.push("Text preview is truncated.")
    const fingerprint = {
      context: this.api.project ? await this.projectOperations.context() : null,
      id: node.id,
      name: node.name,
      layout: node.layout,
      visual: node.visual,
      text: fullText,
      textStyle: node.textStyle,
      originalId: node.originalId,
      locked: node.locked,
      parent: parent?.id ?? null,
      children: children.map((child) => child.id),
    }
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(fingerprint)),
    )
    const revision = `v1:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
    return {
      ref: ref(node.id, this.sessionId),
      type: this.type(node),
      ...(node.name !== undefined
        ? { name: node.name?.slice(0, 512) ?? null }
        : {}),
      parent: parent ? ref(parent.id, this.sessionId) : null,
      ...(relationships
        ? {
            children: children
              .slice(0, 200)
              .map((child) => ref(child.id, this.sessionId)),
            childrenTruncated: children.length > 200,
          }
        : {}),
      ...(include.includes("layout") && node.layout
        ? { layout: node.layout }
        : {}),
      ...(include.includes("visual") && node.visual
        ? { visual: node.visual }
        : {}),
      ...(include.includes("text") && fullText !== undefined
        ? {
            text: {
              content: fullText?.slice(0, 4096) ?? null,
              truncated: (fullText?.length ?? 0) > 4096,
              ...(node.textStyle ? { style: node.textStyle } : {}),
            },
          }
        : {}),
      capabilities: {
        read: true,
        treeRead: node.framerType !== "UnknownNode",
        writableProperties: replicaContext ? [] : properties,
        breakpointWritableProperties: breakpointProperties,
        clearBreakpointOverride: false,
      },
      metadata: {
        framerType: node.framerType,
        isReplica: node.isReplica,
        originalId: node.originalId,
        ...(node.locked !== undefined ? { locked: node.locked } : {}),
        ...(node.isVariant !== undefined ? { isVariant: node.isVariant } : {}),
        ...(node.isBreakpoint !== undefined
          ? { isBreakpoint: node.isBreakpoint }
          : {}),
        ...(node.isPrimaryBreakpoint !== undefined
          ? { isPrimaryBreakpoint: node.isPrimaryBreakpoint }
          : {}),
        ...(node.path !== undefined ? { path: node.path } : {}),
      },
      revision,
      warnings,
    }
  }
  private breakpoint(node: EditorNode): Breakpoint {
    return {
      ref: ref(node.id, this.sessionId),
      name: node.name?.slice(0, 512) ?? null,
      width: node.layout?.width ?? dimension(null),
      primary: node.isPrimaryBreakpoint === true,
      inheritsFrom: node.inheritsFromId
        ? ref(node.inheritsFromId, this.sessionId)
        : null,
    }
  }

  async handle(
    method: Method,
    raw: unknown,
    context: RequestContext,
  ): Promise<RpcResult> {
    this.guard(context)
    const parsed = inputSchemas[method].safeParse(raw)
    if (!parsed.success)
      throw new BridgeError(
        "INVALID_REQUEST",
        "Invalid method parameters",
        false,
      )
    const params = parsed.data
    if (
      "sessionId" in params &&
      params.sessionId &&
      params.sessionId !== this.sessionId
    )
      throw new BridgeError(
        "INVALID_REQUEST",
        "Request targets another editor session",
        false,
      )
    if (
      WRITE_METHODS.has(method) ||
      method === "plan_changes" ||
      method === "open_page"
    ) {
      const operation = this.mutations.then(() => {
        this.guard(context)
        return this.execute(method, params, context).then(
          (result) => {
            if (WRITE_METHODS.has(method))
              this.projectOperations.record(
                method,
                method === "execute_change_plan" &&
                  "status" in result &&
                  result.status !== "completed"
                  ? "error"
                  : "verified",
                method === "execute_change_plan" &&
                  "status" in result &&
                  result.status !== "completed"
                  ? `BATCH_${result.status.toUpperCase()}`
                  : undefined,
              )
            return result
          },
          (error) => {
            if (WRITE_METHODS.has(method))
              this.projectOperations.record(
                method,
                "error",
                error instanceof BridgeError ? error.code : "INTERNAL_ERROR",
              )
            throw error
          },
        )
      })
      this.mutations = operation.catch(() => {})
      return operation
    }
    return this.execute(method, params, context)
  }
  private async execute(
    method: Method,
    raw: unknown,
    context: RequestContext,
  ): Promise<RpcResult> {
    if (method !== "open_page" && this.projectOperations.supports(method))
      return this.projectOperations.execute(method, raw, context)
    switch (method) {
      case "open_page": {
        const p = inputSchemas.open_page.parse(raw)
        this.checkRef(p.expectedCanvas)
        const previous = await this.api.getCanvasRoot()
        if (previous.id !== p.expectedCanvas.id)
          throw new BridgeError(
            "PRECONDITION_FAILED",
            "Active canvas changed; inspect before opening another page",
            false,
          )
        const page = await this.resolve(p.page)
        if (page.framerType !== "WebPageNode")
          throw new BridgeError(
            "NODE_TYPE_UNSUPPORTED",
            "Only web pages can be opened without switching plugin mode",
            false,
          )
        if (!this.api.project)
          throw new BridgeError(
            "CAPABILITY_UNAVAILABLE",
            "Page navigation is unavailable",
            false,
          )
        const project = await this.api.getProjectInfo()
        const branch = await this.api.project.getBranch()
        this.guard(context)
        this.projectOperations.revoke()
        this.cursors.clear()
        if (page.id !== previous.id) await this.api.project.openPage(page.id)
        this.guard(context)
        let current = await this.api.getCanvasRoot()
        for (
          let attempt = 0;
          current.id !== page.id && attempt < 20;
          attempt++
        ) {
          this.guard(context)
          await new Promise<void>((resolve) => setTimeout(resolve, 200))
          this.guard(context)
          current = await this.api.getCanvasRoot()
        }
        if (
          current.id !== page.id ||
          (await this.api.getProjectInfo()).id !== project.id ||
          (await this.api.project.getBranch()).id !== branch.id
        )
          throw new BridgeError(
            "PRECONDITION_FAILED",
            "Navigation context could not be verified; inspect the current project/canvas",
            false,
          )
        return {
          previousCanvas: ref(previous.id, this.sessionId),
          canvasRoot: ref(current.id, this.sessionId),
          changed: current.id !== previous.id,
        }
      }
      case "ping":
        return { alive: true }
      case "get_project": {
        const [project, root] = await Promise.all([
          this.api.getProjectInfo(),
          this.api.getCanvasRoot(),
        ])
        return {
          id: project.id,
          name: project.name.slice(0, 512),
          canvasRoot: ref(root.id, this.sessionId),
          sessionId: this.sessionId,
        }
      }
      case "get_selection": {
        const selection = await this.api.getSelection()
        const nodes: Array<
          Pick<
            DesignNode,
            "ref" | "type" | "name" | "capabilities" | "metadata"
          >
        > = []
        const cache = new Map<string, EditorNode[]>()
        for (const node of selection.slice(0, 200)) {
          this.guard(context)
          const full = await this.snapshot(node, [], cache, false)
          const summary = {
            ref: full.ref,
            type: full.type,
            name: full.name,
            capabilities: full.capabilities,
            metadata: full.metadata,
          }
          if (bytes([...nodes, summary]) > RESULT_BUDGET) break
          nodes.push(summary)
        }
        return {
          nodes,
          total: selection.length,
          truncated: nodes.length < selection.length,
        }
      }
      case "get_node": {
        const params = inputSchemas.get_node.parse(raw)
        return this.snapshot(await this.resolve(params.node), params.include)
      }
      case "get_node_tree":
        return this.tree(inputSchemas.get_node_tree.parse(raw), context)
      case "get_breakpoints": {
        const params = inputSchemas.get_breakpoints.parse(raw)
        const page = params.page
          ? await this.resolve(params.page)
          : await this.api.getCanvasRoot()
        if (page.framerType !== "WebPageNode")
          throw new BridgeError(
            "NODE_TYPE_UNSUPPORTED",
            "Breakpoints require an explicit WebPageNode or an active web page",
            false,
          )
        const nodes = (await page.readChildren()).filter(
          (node) => node.isBreakpoint,
        )
        const result: Breakpoint[] = []
        for (const node of nodes.slice(0, 200)) {
          const normalized = this.breakpoint(node)
          if (bytes([...result, normalized]) > RESULT_BUDGET) break
          result.push(normalized)
        }
        return {
          page: ref(page.id, this.sessionId),
          breakpoints: result,
          truncated: result.length < nodes.length,
        }
      }
      case "get_responsive_state": {
        const params = inputSchemas.get_responsive_state.parse(raw)
        const node = await this.resolve(params.node)
        const lineage = await this.ancestors(node)
        const breakpoint = lineage.find((item) => item.isBreakpoint)
        const replicaContext = lineage.some(
          (item) =>
            item.isReplica || (item.isBreakpoint && !item.isPrimaryBreakpoint),
        )
        const properties: Record<
          string,
          {
            effective: string | number | boolean | null
            source: { kind: "base" | "unknown" }
            overrideStatus: "unknown" | "not_applicable"
          }
        > = {}
        const names = params.properties ?? [
          "layout.width",
          "layout.height",
          "layout.gap",
          "visual.opacity",
        ]
        for (const property of names) {
          let effective: string | number | boolean | null = null
          switch (property) {
            case "layout.width":
              effective = node.layout?.width?.raw ?? null
              break
            case "layout.height":
              effective = node.layout?.height?.raw ?? null
              break
            case "layout.gap":
              effective = node.layout?.gap ?? null
              break
            case "layout.padding":
              effective = node.layout?.padding ?? null
              break
            case "layout.alignment":
              effective = node.layout?.alignment ?? null
              break
            case "visual.opacity":
              effective = node.visual?.opacity ?? null
              break
            case "visual.backgroundColor":
              effective =
                node.visual?.background?.kind === "literal"
                  ? node.visual.background.value
                  : null
              break
            case "text.fontSize":
              effective = null
              break // Shared text-style size is not the effective node font size.
          }
          const available =
            property === "text.fontSize"
              ? false
              : property === "visual.backgroundColor"
                ? node.visual?.background?.kind === "literal" ||
                  node.visual?.background?.kind === "none"
                : property === "visual.opacity"
                  ? node.visual?.opacity !== undefined
                  : property.startsWith("layout.") &&
                    node.layout !== undefined &&
                    property.slice(7) in node.layout
          properties[property] = {
            effective,
            source: { kind: replicaContext || !available ? "unknown" : "base" },
            overrideStatus:
              replicaContext || !available ? "unknown" : "not_applicable",
          }
        }
        const snapshot = await this.snapshot(node)
        return {
          node: ref(node.id, this.sessionId),
          breakpoint: breakpoint ? this.breakpoint(breakpoint) : null,
          original: node.originalId
            ? ref(node.originalId, this.sessionId)
            : null,
          properties,
          support: {
            overrideRead: false,
            overrideSet:
              snapshot.capabilities.breakpointWritableProperties.length > 0,
            overrideClear: false,
            nodeFontSize: false,
          },
          warnings: [
            "The public Plugin API does not expose per-property override flags or override removal. Equal values do not prove inheritance.",
            ...(names.includes("text.fontSize")
              ? [
                  "Effective node fontSize is unavailable. Text style presets are shared and cannot be used as isolated breakpoint overrides.",
                ]
              : []),
          ],
        }
      }
      case "update_node": {
        const params = inputSchemas.update_node.parse(raw)
        return this.mutate(
          params.node,
          params.changes,
          params.expected?.revision,
          undefined,
          context,
        )
      }
      case "set_breakpoint_override": {
        const params = inputSchemas.set_breakpoint_override.parse(raw)
        return this.mutate(
          params.node,
          params.changes,
          params.expected?.revision,
          params.breakpoint,
          context,
        )
      }
      case "clear_breakpoint_override": {
        const params = inputSchemas.clear_breakpoint_override.parse(raw)
        await this.resolve(params.node)
        await this.resolve(params.breakpoint)
        throw new BridgeError(
          "BREAKPOINT_WRITE_UNSUPPORTED",
          "Framer's public Plugin API cannot clear a property override. Copying the base value would create an override, not restore inheritance.",
          false,
        )
      }
    }
    throw new BridgeError("INVALID_REQUEST", "Unknown editor operation", false)
  }

  private async tree(
    params: ReturnType<typeof inputSchemas.get_node_tree.parse>,
    context: RequestContext,
  ): Promise<RpcResult> {
    const canvas = await this.api.getCanvasRoot()
    for (const [id, walk] of this.cursors)
      if (walk.expiresAt < Date.now()) this.cursors.delete(id)
    let walk: Walk
    if (params.cursor) {
      if (params.root || params.depth !== undefined || params.include)
        throw new BridgeError(
          "INVALID_CURSOR",
          "Continue using only cursor, sessionId and maxNodes",
          false,
        )
      const saved = this.cursors.get(params.cursor)
      if (!saved || saved.canvasId !== canvas.id)
        throw new BridgeError(
          "INVALID_CURSOR",
          "Cursor expired or the active canvas changed; restart the traversal",
          false,
        )
      walk = {
        ...saved,
        frontier: [...saved.frontier],
        seen: new Set(saved.seen),
      }
    } else {
      const root = params.root ? await this.resolve(params.root) : canvas
      walk = {
        root: ref(root.id, this.sessionId),
        canvasId: canvas.id,
        frontier: [{ id: root.id, depth: 0 }],
        seen: new Set(),
        depth: params.depth ?? 3,
        include: params.include ?? allIncludes,
        expiresAt: Date.now() + 60_000,
      }
    }
    const nodes: DesignNode[] = []
    const reasons = new Set<
      "depth" | "nodes" | "payload" | "unsupported" | "changed"
    >()
    const continuationRoots: NodeRef[] = []
    const cache = new Map<string, EditorNode[]>()
    const maxNodes = params.maxNodes ?? 50
    while (walk.frontier.length && nodes.length < maxNodes) {
      this.guard(context)
      const item = walk.frontier[0]
      if (!item) break
      if (walk.seen.has(item.id)) {
        walk.frontier.shift()
        continue
      }
      if (walk.seen.size >= 10_000)
        throw new BridgeError(
          "TREE_LIMIT_REACHED",
          "Traversal exceeds the cursor visit limit; choose a smaller root",
          false,
        )
      const node = await this.api.getNode(item.id)
      if (!node) {
        walk.frontier.shift()
        reasons.add("changed")
        continue
      }
      const snapshot = await this.snapshot(node, walk.include, cache)
      if (
        bytes({
          root: walk.root,
          nodes: [...nodes, snapshot],
          continuationRoots,
        }) > RESULT_BUDGET
      ) {
        if (!nodes.length)
          throw new BridgeError(
            "PAYLOAD_TOO_LARGE",
            "This node exceeds the tree page budget; request fewer include sections",
            false,
          )
        reasons.add("payload")
        break
      }
      const children = await node.readChildren()
      if (
        item.depth < walk.depth &&
        walk.frontier.length + children.length > MAX_FRONTIER
      )
        throw new BridgeError(
          "TREE_LIMIT_REACHED",
          "Tree frontier exceeds its bounded cursor capacity; choose a smaller root or depth",
          false,
        )
      walk.frontier.shift()
      walk.seen.add(item.id)
      nodes.push(snapshot)
      if (node.framerType === "UnknownNode") reasons.add("unsupported")
      if (item.depth < walk.depth) {
        for (const child of children)
          if (!walk.seen.has(child.id))
            walk.frontier.push({ id: child.id, depth: item.depth + 1 })
      } else if (children.length) {
        reasons.add("depth")
        for (const child of children) {
          const candidate = ref(child.id, this.sessionId)
          if (continuationRoots.length >= 200) break
          if (
            bytes({
              root: walk.root,
              nodes,
              continuationRoots: [...continuationRoots, candidate],
            }) > RESULT_BUDGET
          ) {
            reasons.add("payload")
            break
          }
          continuationRoots.push(candidate)
        }
      }
    }
    const result = {
      root: walk.root,
      nodes,
      truncated: reasons.size > 0 || walk.frontier.length > 0,
      reasons: [...reasons],
      continuationRoots,
      live: true as const,
    }
    if (params.cursor) this.cursors.delete(params.cursor)
    if (walk.frontier.length) {
      if (!reasons.has("payload")) result.reasons.push("nodes")
      if (this.cursors.size >= 8)
        this.cursors.delete(this.cursors.keys().next().value ?? "")
      const next = globalThis.crypto.randomUUID()
      walk.expiresAt = Date.now() + 60_000
      this.cursors.set(next, walk)
      return { ...result, next }
    }
    return result
  }
  private flatten(changes: MutationPatch): string[] {
    return [
      ...(changes.name !== undefined ? ["name"] : []),
      ...Object.keys(changes.layout ?? {}).map(
        (property) => `layout.${property}`,
      ),
      ...Object.keys(changes.visual ?? {}).map(
        (property) => `visual.${property}`,
      ),
      ...(changes.text ? ["text.content"] : []),
    ]
  }
  private dimensions(
    value: NonNullable<MutationPatch["layout"]>["width"],
  ): EditableAttributes["width"] {
    if (!value) return null
    switch (value.mode) {
      case "fixed":
        return `${value.value}px`
      case "percentage":
        return `${value.value}%`
      case "fill":
        return `${value.value}fr`
      case "fit-content":
        return "fit-content"
    }
  }
  private attributes(changes: MutationPatch): EditableAttributes {
    const update: EditableAttributes = {}
    if (changes.name !== undefined) update.name = changes.name
    if (changes.layout?.width)
      update.width = this.dimensions(changes.layout.width)
    if (changes.layout?.height)
      update.height = this.dimensions(changes.layout.height)
    if (changes.layout?.gap !== undefined)
      update.gap = `${changes.layout.gap}px`
    if (changes.layout?.padding) {
      const { top, right, bottom, left } = changes.layout.padding
      update.padding = `${top}px ${right}px ${bottom}px ${left}px`
    }
    if (changes.layout?.alignment !== undefined)
      update.stackAlignment = changes.layout.alignment
    if (changes.visual?.opacity !== undefined)
      update.opacity = changes.visual.opacity
    if (changes.visual?.backgroundColor !== undefined)
      update.backgroundColor = changes.visual.backgroundColor
    return update
  }
  private matches(snapshot: DesignNode, changes: MutationPatch): boolean {
    if (changes.name !== undefined && snapshot.name !== changes.name)
      return false
    if (changes.text && snapshot.text?.content !== changes.text.content)
      return false
    for (const [key, value] of Object.entries(changes.layout ?? {})) {
      if (key === "width" || key === "height") {
        const expected = this.dimensions(
          value as NonNullable<MutationPatch["layout"]>["width"],
        )
        if (snapshot.layout?.[key]?.raw !== expected) return false
      } else if (key === "gap") {
        const gap = snapshot.layout?.gap
        if (gap !== `${value}px` && gap !== `${value}px ${value}px`)
          return false
      } else if (key === "padding" && changes.layout?.padding) {
        const { top, right, bottom, left } = changes.layout.padding
        if (
          snapshot.layout?.padding !==
            `${top}px ${right}px ${bottom}px ${left}px` &&
          !(
            top === right &&
            top === bottom &&
            top === left &&
            snapshot.layout?.padding === `${top}px`
          )
        )
          return false
      } else if (key === "alignment" && snapshot.layout?.alignment !== value)
        return false
    }
    if (
      changes.visual?.opacity !== undefined &&
      snapshot.visual?.opacity !== changes.visual.opacity
    )
      return false
    if (changes.visual?.backgroundColor !== undefined) {
      const observed = snapshot.visual?.background
      const desired = changes.visual.backgroundColor
      if (
        desired === null
          ? observed?.kind !== "none"
          : observed?.kind !== "literal" || !sameColor(observed.value, desired)
      )
        return false
    }
    return true
  }

  private async mutate(
    target: NodeRef,
    raw: MutationPatch,
    expected: string | undefined,
    breakpointRef: NodeRef | undefined,
    context: RequestContext,
    dryRun = false,
  ): Promise<RpcResult> {
    const branchContext = this.api.project
      ? await this.projectOperations.context()
      : undefined
    const changes = mutationPatchSchema.parse(raw)
    let node = await this.resolve(target)
    const before = await this.snapshot(node)
    const lineage = await this.ancestors(node)
    const scope = breakpointRef ? ("breakpoint" as const) : ("base" as const)
    let originalBefore: DesignNode | undefined
    if (expected && before.revision !== expected)
      throw new BridgeError(
        "PRECONDITION_FAILED",
        "The node changed since inspection; read it again before writing",
        false,
      )
    if (breakpointRef) {
      this.checkRef(breakpointRef)
      const breakpoint = lineage.find((item) => item.isBreakpoint)
      if (!breakpoint || breakpoint.id !== breakpointRef.id)
        throw new BridgeError(
          "BREAKPOINT_NOT_FOUND",
          "Target node is not inside the explicitly requested breakpoint",
          false,
        )
      if (
        breakpoint.isPrimaryBreakpoint ||
        !node.isReplica ||
        !node.originalId ||
        node.originalId === node.id
      )
        throw new BridgeError(
          "BREAKPOINT_WRITE_UNSUPPORTED",
          "Only a concrete non-primary replica with a resolvable original can receive an override",
          false,
        )
      const original = await this.resolve(ref(node.originalId, this.sessionId))
      const originalLineage = await this.ancestors(original)
      const page = lineage.find((item) => item.framerType === "WebPageNode")
      const originalPage = originalLineage.find(
        (item) => item.framerType === "WebPageNode",
      )
      if (
        !page ||
        page.id !== originalPage?.id ||
        !originalLineage.some((item) => item.isPrimaryBreakpoint)
      )
        throw new BridgeError(
          "BREAKPOINT_WRITE_UNSUPPORTED",
          "Cannot establish a safe replica to primary breakpoint relationship",
          false,
        )
      originalBefore = await this.snapshot(original)
    } else if (
      lineage.some(
        (item) =>
          item.isReplica || (item.isBreakpoint && !item.isPrimaryBreakpoint),
      )
    ) {
      throw new BridgeError(
        "BREAKPOINT_WRITE_UNSUPPORTED",
        "update_node only writes base nodes; use explicit breakpoint overrides for replicas",
        false,
      )
    }
    const permitted = breakpointRef
      ? before.capabilities.breakpointWritableProperties
      : before.capabilities.writableProperties
    for (const property of this.flatten(changes))
      if (!permitted.includes(property))
        throw new BridgeError(
          "PROPERTY_UNSUPPORTED",
          `Property ${property} is unavailable for this node, scope or current permissions`,
          false,
        )
    const warnings = [
      "Preconditions are best-effort fingerprints; Framer does not provide an atomic compare-and-set for these operations.",
    ]
    if (changes.text)
      warnings.push(
        "This replaces plain text. Rich inline formatting may change.",
      )
    if (!breakpointRef)
      warnings.push(
        "Base changes can propagate to inheriting breakpoint replicas.",
      )
    if (
      changes.visual?.backgroundColor !== undefined &&
      before.visual?.background?.kind === "style"
    )
      warnings.push(
        "The explicit color change replaces the existing color-style binding.",
      )
    if (this.matches(before, changes))
      return {
        changed: false,
        node: before.ref,
        applied: changes,
        snapshot: before,
        scope,
        warnings: [
          ...warnings,
          ...(breakpointRef
            ? [
                "Effective values already match. No override was materialized; existing inheritance was preserved.",
              ]
            : []),
        ],
      }
    // Resolve again after inspection and queueing. All validation happens before a write.
    node = await this.resolve(target)
    const latest = await this.snapshot(node)
    const latestLineage = await this.ancestors(node)
    const lineageScope = (items: EditorNode[]) =>
      items.map((n) => ({
        id: n.id,
        locked: n.locked,
        isReplica: n.isReplica,
        isVariant: n.isVariant,
        framerType: n.framerType,
        isBreakpoint: n.isBreakpoint,
        isPrimaryBreakpoint: n.isPrimaryBreakpoint,
        originalId: n.originalId,
      }))
    if (
      JSON.stringify(lineageScope(latestLineage)) !==
      JSON.stringify(lineageScope(lineage))
    )
      throw new BridgeError(
        "PRECONDITION_FAILED",
        "Node ancestry or scope changed during validation",
        false,
      )
    if (latest.revision !== before.revision)
      throw new BridgeError(
        "PRECONDITION_FAILED",
        "Node changed during validation; inspect it again",
        false,
      )
    const currentProperties = breakpointRef
      ? latest.capabilities.breakpointWritableProperties
      : latest.capabilities.writableProperties
    for (const property of this.flatten(changes))
      if (!currentProperties.includes(property))
        throw new BridgeError(
          "CAPABILITY_UNAVAILABLE",
          "Write permissions or node scope changed during validation",
          false,
        )
    if (branchContext) await this.projectOperations.assertContext(branchContext)
    this.guard(context)
    if (dryRun)
      return {
        changed: false,
        node: before.ref,
        applied: changes,
        snapshot: before,
        scope,
        warnings,
      }
    try {
      if (changes.text) {
        if (!node.setText || !this.api.canSetText())
          throw new Error("Permission changed")
        await node.setText(changes.text.content)
      } else {
        if (!this.api.canSetAttributes()) throw new Error("Permission changed")
        if (!(await node.setAttributes(this.attributes(changes))))
          throw new Error("Node removed")
      }
      const after = await this.snapshot(await this.resolve(target))
      if (branchContext)
        await this.projectOperations.assertContext(branchContext)
      if (!this.matches(after, changes)) throw new Error("Readback mismatch")
      if (originalBefore) {
        const originalAfter = await this.snapshot(
          await this.resolve(originalBefore.ref),
        )
        if (originalAfter.revision !== originalBefore.revision)
          throw new Error("Original changed")
        warnings.push(
          "Primary node readback is unchanged; local effective value matches the requested override. Override flags remain unavailable.",
        )
      }
      return {
        changed: after.revision !== before.revision,
        node: after.ref,
        applied: changes,
        snapshot: after,
        warnings,
        scope,
      }
    } catch {
      throw new BridgeError(
        "MUTATION_RESULT_UNKNOWN",
        "Framer write or verification failed and the mutation may have applied. Inspect the target and base nodes before attempting another write.",
        false,
      )
    }
  }
}

function sameColor(left: string, right: string): boolean {
  const parse = (value: string): number[] | undefined => {
    const hex = value.match(/^#([a-f0-9]{6})([a-f0-9]{2})?$/i)
    if (hex?.[1])
      return [
        Number.parseInt(hex[1].slice(0, 2), 16),
        Number.parseInt(hex[1].slice(2, 4), 16),
        Number.parseInt(hex[1].slice(4, 6), 16),
        hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1,
      ]
    const rgba = value.match(
      /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/,
    )
    return rgba
      ? [
          Number(rgba[1]),
          Number(rgba[2]),
          Number(rgba[3]),
          Number(rgba[4] ?? 1),
        ]
      : undefined
  }
  const a = parse(left),
    b = parse(right)
  return (
    a !== undefined &&
    b !== undefined &&
    a.every((value, index) => Math.abs(value - (b[index] ?? -1)) < 0.001)
  )
}
