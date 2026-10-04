import type { DesignNode, NodeRef } from "@framer-plus/core"
import {
  BridgeError,
  type ChangePlan,
  type CmsItemSnapshot,
  type ComponentSnapshot,
  inputSchemas,
  type Method,
  type MethodResult,
  type NodePlanOperation,
  type PlanOperation,
  planSchema,
  planTarget,
  projectInputSchemas,
  type RequestContext,
  type RpcResult,
} from "@framer-plus/protocol"
import type { EditorApi, EditorNode } from "./api.js"
import { ref } from "./api.js"
import type { CmsCollection, CmsItem } from "./project-api.js"

const budget = 48 * 1024
const bytes = (v: unknown) =>
  new TextEncoder().encode(JSON.stringify(v)).byteLength
const scalar = (v: unknown): v is string | number | boolean =>
  typeof v === "boolean" ||
  (typeof v === "string" && v.length <= 4096) ||
  (typeof v === "number" && Number.isFinite(v))
const safeKey = (k: string) =>
  !["__proto__", "constructor", "prototype"].includes(k)
export async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return `v1:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`
}
interface Host {
  resolve(ref: NodeRef): Promise<EditorNode>
  snapshot(node: EditorNode): Promise<DesignNode>
  ancestors(node: EditorNode): Promise<EditorNode[]>
  mutate(
    op: NodePlanOperation,
    context: RequestContext,
    dryRun: boolean,
  ): Promise<RpcResult>
  guard(context: RequestContext): void
}
export class ProjectOperations {
  private plans = new Map<string, ChangePlan>()
  private listeners = new Set<() => void>()
  private audit: Array<{
    id: string
    at: number
    method: string
    outcome: "verified" | "error"
    code?: string
    planId?: string
  }> = []
  private auditDropped = false
  constructor(
    private api: EditorApi,
    private sessionId: string,
    private host: Host,
  ) {}
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private emit() {
    for (const listener of this.listeners) listener()
  }
  pending() {
    this.expire()
    return [...this.plans.values()]
      .filter((p) => p.status === "pending")
      .map((p) => structuredClone(p))
  }
  review() {
    this.expire()
    return [...this.plans.values()]
      .slice(-8)
      .reverse()
      .map((p) => structuredClone(p))
  }
  decide(id: string, approved: boolean) {
    const p = this.plan(id)
    if (p.status !== "pending") return
    p.status = approved ? "approved" : "rejected"
    this.record(
      approved ? "plan.approved" : "plan.rejected",
      "verified",
      undefined,
      p.id,
    )
    this.emit()
  }
  revoke() {
    for (const p of this.plans.values())
      if (["pending", "approved"].includes(p.status)) p.status = "rejected"
    this.emit()
  }
  record(
    method: string,
    outcome: "verified" | "error",
    code?: string,
    planId?: string,
  ) {
    this.audit.push({
      id: crypto.randomUUID(),
      at: Date.now(),
      method,
      outcome,
      ...(code ? { code } : {}),
      ...(planId ? { planId } : {}),
    })
    if (this.audit.length > 100) {
      this.audit.shift()
      this.auditDropped = true
    }
  }
  private expire() {
    for (const p of this.plans.values())
      if (
        ["pending", "approved"].includes(p.status) &&
        p.expiresAt <= Date.now()
      )
        p.status = "expired"
  }
  private plan(id: string) {
    this.expire()
    const p = this.plans.get(id)
    if (!p)
      throw new BridgeError(
        "PLAN_NOT_FOUND",
        "Change plan is unavailable in this editor session",
        false,
      )
    return p
  }
  private project() {
    if (!this.api.project)
      throw new BridgeError(
        "CAPABILITY_UNAVAILABLE",
        "Project resources are unavailable in this adapter",
        false,
      )
    return this.api.project
  }
  async context() {
    const [project, branch] = await Promise.all([
      this.api.getProjectInfo(),
      this.project().getBranch(),
    ])
    return { projectId: project.id, branchId: branch.id }
  }
  async assertContext(expected: {
    projectId: string
    branchId: string | null
  }) {
    if (JSON.stringify(await this.context()) !== JSON.stringify(expected))
      throw new BridgeError(
        "PRECONDITION_FAILED",
        "Project or active branch changed; inspect and plan again",
        false,
      )
  }
  private async writable(node: EditorNode, kind: "instance" | "base") {
    const ancestry = await this.host.ancestors(node)
    if (
      !this.api.canSetAttributes() ||
      ancestry.some(
        (n) =>
          n.locked ||
          (n.isVariant && !n.isBreakpoint) ||
          n.isReplica ||
          (n.isBreakpoint && !n.isPrimaryBreakpoint) ||
          n.framerType === "ComponentNode",
      ) ||
      (kind === "instance" && node.framerType !== "ComponentInstanceNode")
    )
      throw new BridgeError(
        "CAPABILITY_UNAVAILABLE",
        "Target scope or permissions do not allow this mutation",
        false,
      )
  }
  private page<T>(items: T[], offset: number, limit: number) {
    const output: T[] = []
    for (const item of items.slice(offset, offset + limit)) {
      if (bytes([...output, item]) > budget) break
      output.push(item)
    }
    if (items.length > offset && !output.length)
      throw new BridgeError(
        "PAYLOAD_TOO_LARGE",
        "Resource exceeds the page budget",
        false,
      )
    const next =
      offset + output.length < items.length ? offset + output.length : null
    return {
      items: output,
      nextOffset: next,
      truncated: next !== null,
      live: true as const,
    }
  }
  private async component(
    node: EditorNode,
    definitions?: EditorNode[],
  ): Promise<ComponentSnapshot> {
    if (
      !node.component ||
      !["ComponentNode", "ComponentInstanceNode"].includes(node.framerType)
    )
      throw new BridgeError(
        "NODE_TYPE_UNSUPPORTED",
        "Target is not a component definition or instance",
        false,
      )
    const defs = definitions ?? (await this.project().getDefinitions())
    const matches = defs.filter(
      (d) => d.component?.identifier === node.component?.identifier,
    )
    const kind = node.framerType === "ComponentNode" ? "definition" : "instance"
    const definition =
      kind === "definition"
        ? node
        : matches.length === 1
          ? matches[0]
          : undefined
    const children = definition ? await definition.readChildren() : []
    const variants = children.filter((n) => n.isVariant)
    let writable = false
    try {
      await this.writable(node, "instance")
      writable = true
    } catch {}
    const controls: ComponentSnapshot["controls"] = {}
    let truncated = false
    for (const [key, value] of Object.entries(node.component.controls)) {
      if (
        !safeKey(key) ||
        key.length > 256 ||
        Object.keys(controls).length >= 100
      ) {
        truncated = true
        continue
      }
      controls[key] = {
        value: scalar(value) ? value : null,
        available: scalar(value),
        writable: writable && scalar(value),
        override: "unknown",
      }
      if (bytes(controls) > 24 * 1024) {
        delete controls[key]
        truncated = true
        break
      }
    }
    const normalizedVariants: ComponentSnapshot["variants"] = []
    for (const v of variants.slice(0, 100)) {
      const item = {
        node: ref(v.id, this.sessionId),
        name: v.name?.slice(0, 512) ?? null,
        primary: v.variant?.primary ?? false,
        gesture: v.variant?.gesture ?? null,
        inheritsFrom: v.inheritsFromId
          ? ref(v.inheritsFromId, this.sessionId)
          : null,
      }
      if (bytes([...normalizedVariants, item]) > 16 * 1024) break
      normalizedVariants.push(item)
    }
    const data = {
      node: ref(node.id, this.sessionId),
      kind,
      name: node.name?.slice(0, 512) ?? null,
      identifier: node.component.identifier,
      definition: definition ? ref(definition.id, this.sessionId) : null,
      resolution: definition
        ? "resolved"
        : matches.length > 1
          ? "ambiguous"
          : "external_or_unavailable",
      controls,
      support: {
        variantAxes: false,
        overrideRead: false,
        overrideClear: false,
      },
      variants: normalizedVariants,
      truncated: truncated || normalizedVariants.length < variants.length,
      warnings: [
        "Per-control override provenance, selected variant axes and override removal are not exposed by the public node API.",
        "Only existing primitive controls of the same value type can be changed. Variables, bindings, objects, events and slots are read-only.",
      ],
    } as const
    return {
      ...data,
      variants: [...data.variants],
      warnings: [...data.warnings],
      revision: await fingerprint({
        data,
        nodeRevision: (await this.host.snapshot(node)).revision,
      }),
    }
  }
  private async collection(id: string): Promise<CmsCollection> {
    const c = await this.project().getCollection(id)
    if (!c)
      throw new BridgeError(
        "RESOURCE_NOT_FOUND",
        "CMS collection is unavailable",
        false,
      )
    return c
  }
  private collectionInfo(c: CmsCollection) {
    return {
      id: c.id,
      name: c.name.slice(0, 512),
      managedBy: c.managedBy,
      writable: c.managedBy === "user" && this.project().canSetCms(),
    }
  }
  private async itemSnapshot(item: CmsItem): Promise<CmsItemSnapshot> {
    const fields: CmsItemSnapshot["fields"] = {}
    let truncated = false
    for (const [key, v] of Object.entries(item.fields)) {
      if (
        !safeKey(key) ||
        key.length > 256 ||
        Object.keys(fields).length >= 100
      ) {
        truncated = true
        continue
      }
      fields[key] = {
        type: v.type,
        value: scalar(v.value) ? v.value : null,
        available: scalar(v.value),
      }
      if (bytes(fields) > 32 * 1024) {
        delete fields[key]
        truncated = true
        break
      }
    }
    const data = {
      id: item.id,
      slug: item.slug.slice(0, 512),
      draft: item.draft,
      fields,
      truncated,
    }
    return {
      ...data,
      revision: await fingerprint({ data, context: await this.context() }),
    }
  }
  private operationMethod(op: PlanOperation) {
    return op.scope === "base"
      ? "update_node"
      : op.scope === "breakpoint"
        ? "set_breakpoint_override"
        : op.scope === "instance"
          ? "update_instance"
          : op.scope === "style"
            ? "apply_style"
            : "update_collection_item"
  }
  private resultTarget(op: PlanOperation) {
    return {
      target: planTarget(op),
      ...(op.scope === "cms"
        ? { collectionId: op.collectionId, itemId: op.itemId }
        : { node: op.node }),
    }
  }
  private async operation(
    op: PlanOperation,
    context: RequestContext,
    dryRun: boolean,
  ): Promise<{
    changed: boolean
    snapshot: DesignNode | ComponentSnapshot | CmsItemSnapshot
  }> {
    if (op.scope === "base" || op.scope === "breakpoint")
      return (await this.host.mutate(op, context, dryRun)) as {
        changed: boolean
        snapshot: DesignNode
      }
    const { scope, ...input } = op
    return (await this.execute(
      this.operationMethod(op),
      {
        ...input,
        ...(scope === "style"
          ? { scope: "base" }
          : scope === "instance"
            ? { scope: "instance" }
            : {}),
      },
      context,
      dryRun,
    )) as {
      changed: boolean
      snapshot: DesignNode | ComponentSnapshot | CmsItemSnapshot
    }
  }
  async execute(
    method: Method,
    raw: unknown,
    context: RequestContext,
    dryRun = false,
  ): Promise<RpcResult> {
    this.host.guard(context)
    switch (method) {
      case "get_pages": {
        const p = inputSchemas.get_pages.parse(raw)
        const canvas = await this.api.getCanvasRoot()
        const pages = await this.project().getPages(p.kind)
        return this.page(
          pages.map((n) => ({
            ref: ref(n.id, this.sessionId),
            name: n.name?.slice(0, 512) ?? null,
            kind:
              n.framerType === "WebPageNode"
                ? ("web" as const)
                : ("design" as const),
            path: n.path?.slice(0, 4096) ?? null,
            active: n.id === canvas.id,
          })),
          p.offset,
          p.limit,
        )
      }
      case "get_components": {
        const p = inputSchemas.get_components.parse(raw)
        const defs = await this.project().getDefinitions()
        const items = []
        for (const n of defs.slice(p.offset, p.offset + p.limit)) {
          this.host.guard(context)
          const value = await this.component(n, defs)
          if (bytes([...items, value]) > budget) break
          items.push(value)
        }
        if (defs.length > p.offset && !items.length)
          throw new BridgeError(
            "PAYLOAD_TOO_LARGE",
            "Component exceeds list budget",
            false,
          )
        const next =
          p.offset + items.length < defs.length ? p.offset + items.length : null
        return { items, nextOffset: next, truncated: next !== null, live: true }
      }
      case "get_component":
        return this.component(
          await this.host.resolve(inputSchemas.get_component.parse(raw).node),
        )
      case "clear_instance_override":
        await this.host.resolve(
          inputSchemas.clear_instance_override.parse(raw).node,
        )
        throw new BridgeError(
          "OVERRIDE_CLEAR_UNSUPPORTED",
          "The public Plugin API does not expose per-control override removal",
          false,
        )
      case "update_instance": {
        const p = inputSchemas.update_instance.parse(raw)
        const scope = await this.context()
        let node = await this.host.resolve(p.node)
        await this.writable(node, "instance")
        const before = await this.component(node)
        if (before.revision !== p.expected.revision)
          throw new BridgeError(
            "PRECONDITION_FAILED",
            "Instance changed since inspection",
            false,
          )
        for (const [key, value] of Object.entries(p.controls)) {
          const control = before.controls[key]
          if (!control?.writable || typeof control.value !== typeof value)
            throw new BridgeError(
              "PROPERTY_UNSUPPORTED",
              "Only existing writable primitive controls of the same type are supported",
              false,
            )
        }
        if (
          Object.entries(p.controls).every(
            ([k, v]) => before.controls[k]?.value === v,
          )
        )
          return { changed: false, snapshot: before, warnings: [] }
        node = await this.host.resolve(p.node)
        if ((await this.component(node)).revision !== before.revision)
          throw new BridgeError(
            "PRECONDITION_FAILED",
            "Instance changed during validation",
            false,
          )
        await this.writable(node, "instance")
        await this.assertContext(scope)
        this.host.guard(context)
        if (dryRun) return { changed: false, snapshot: before, warnings: [] }
        try {
          if (!node.setControls || !(await node.setControls(p.controls)))
            throw Error()
          const after = await this.component(await this.host.resolve(p.node))
          await this.assertContext(scope)
          if (
            !Object.entries(p.controls).every(
              ([k, v]) => after.controls[k]?.value === v,
            )
          )
            throw Error()
          for (const [key, control] of Object.entries(before.controls))
            if (
              !(key in p.controls) &&
              control.available &&
              after.controls[key]?.value !== control.value
            )
              throw Error("Unrequested control changed")
          return {
            changed: true,
            snapshot: after,
            warnings: [
              "Only this instance's control attributes were written; override provenance remains unknown.",
            ],
          }
        } catch {
          throw new BridgeError(
            "MUTATION_RESULT_UNKNOWN",
            "Instance write may have applied; inspect before retrying",
            false,
          )
        }
      }
      case "get_styles": {
        const p = inputSchemas.get_styles.parse(raw)
        return p.kind === "color"
          ? this.page(await this.project().getColorStyles(), p.offset, p.limit)
          : this.page(await this.project().getTextStyles(), p.offset, p.limit)
      }
      case "get_assets": {
        const p = inputSchemas.get_assets.parse(raw)
        if (p.kind === "svg")
          return this.page(
            (await this.project().getSvgs()).map((s) => ({
              id: s.id,
              node: ref(s.nodeId, this.sessionId),
              byteLength: s.byteLength,
            })),
            p.offset,
            p.limit,
          )
        const assets = new Map<
          string,
          { id: string; url: string; nodes: NodeRef[] }
        >()
        let omitted = false
        for (const image of await this.project().getImages()) {
          const entry = assets.get(image.id) ?? {
            id: image.id,
            url: image.url,
            nodes: [],
          }
          if (entry.nodes.length < 100)
            entry.nodes.push(ref(image.nodeId, this.sessionId))
          else omitted = true
          assets.set(image.id, entry)
        }
        const result = this.page([...assets.values()], p.offset, p.limit)
        return { ...result, truncated: result.truncated || omitted }
      }
      case "apply_style": {
        const p = inputSchemas.apply_style.parse(raw)
        const scope = await this.context()
        let node = await this.host.resolve(p.node)
        await this.writable(node, "base")
        if (node.framerType !== (p.kind === "color" ? "FrameNode" : "TextNode"))
          throw new BridgeError(
            "NODE_TYPE_UNSUPPORTED",
            "Color bindings require a frame; text styles require a text node",
            false,
          )
        const styles =
          p.kind === "color"
            ? await this.project().getColorStyles()
            : await this.project().getTextStyles()
        if (!styles.some((s) => s.id === p.styleId))
          throw new BridgeError(
            "RESOURCE_NOT_FOUND",
            "Style no longer exists",
            false,
          )
        const before = await this.host.snapshot(node)
        if (before.revision !== p.expected.revision)
          throw new BridgeError(
            "PRECONDITION_FAILED",
            "Node changed since inspection",
            false,
          )
        const bound =
          p.kind === "color"
            ? before.visual?.background?.kind === "style"
              ? before.visual.background.id
              : undefined
            : before.text?.style?.id
        if (bound === p.styleId)
          return { changed: false, snapshot: before, warnings: [] }
        node = await this.host.resolve(p.node)
        await this.writable(node, "base")
        if ((await this.host.snapshot(node)).revision !== before.revision)
          throw new BridgeError(
            "PRECONDITION_FAILED",
            "Node changed during validation",
            false,
          )
        await this.assertContext(scope)
        this.host.guard(context)
        if (dryRun) return { changed: false, snapshot: before, warnings: [] }
        try {
          if (!(await this.project().bindStyle(node.id, p.kind, p.styleId)))
            throw Error()
          const after = await this.host.snapshot(
            await this.host.resolve(p.node),
          )
          await this.assertContext(scope)
          const id =
            p.kind === "color"
              ? after.visual?.background?.kind === "style"
                ? after.visual.background.id
                : null
              : after.text?.style?.id
          if (id !== p.styleId) throw Error()
          return {
            changed: true,
            snapshot: after,
            warnings: [
              "Binding references an existing shared style. Future style edits affect its consumers; base changes may propagate to replicas.",
            ],
          }
        } catch {
          throw new BridgeError(
            "MUTATION_RESULT_UNKNOWN",
            "Style binding may have applied; inspect before retrying",
            false,
          )
        }
      }
      case "get_collections": {
        const p = inputSchemas.get_collections.parse(raw)
        return this.page(
          (await this.project().getCollections()).map((c) =>
            this.collectionInfo(c),
          ),
          p.offset,
          p.limit,
        )
      }
      case "get_collection_schema": {
        const p = inputSchemas.get_collection_schema.parse(raw)
        const c = await this.collection(p.collectionId)
        const fields = await c.getFields()
        const info = this.collectionInfo(c)
        const result = this.page(
          fields.map((f) => ({
            ...f,
            name: f.name.slice(0, 512),
            writable:
              info.writable &&
              ["string", "number", "boolean"].includes(f.type) &&
              !f.basedOn,
          })),
          0,
          100,
        )
        return {
          collection: info,
          fields: result.items,
          truncated: result.truncated,
        }
      }
      case "get_collection_items": {
        const p = inputSchemas.get_collection_items.parse(raw)
        const c = await this.collection(p.collectionId)
        const native = await c.getItems()
        const items = []
        for (const i of native.slice(p.offset, p.offset + p.limit)) {
          this.host.guard(context)
          const s = await this.itemSnapshot(i)
          if (bytes([...items, s]) > budget) break
          items.push(s)
        }
        if (native.length > p.offset && !items.length)
          throw new BridgeError(
            "PAYLOAD_TOO_LARGE",
            "CMS item exceeds list budget",
            false,
          )
        const next =
          p.offset + items.length < native.length
            ? p.offset + items.length
            : null
        return { items, nextOffset: next, truncated: next !== null, live: true }
      }
      case "update_collection_item": {
        const p = inputSchemas.update_collection_item.parse(raw)
        const scope = await this.context()
        let c = await this.collection(p.collectionId)
        const validate = async () => {
          if (!this.collectionInfo(c).writable)
            throw new BridgeError(
              "CAPABILITY_UNAVAILABLE",
              "Only user-managed collections with content-edit permissions are writable",
              false,
            )
          const fields = await c.getFields()
          for (const [key, entry] of Object.entries(p.fields)) {
            const f = fields.find((f) => f.id === key)
            if (
              !f ||
              f.type !== entry.type ||
              f.basedOn ||
              (f.required && entry.type === "string" && !entry.value.trim())
            )
              throw new BridgeError(
                "PROPERTY_UNSUPPORTED",
                "CMS field type, required value or binding does not allow this patch",
                false,
              )
          }
        }
        await validate()
        let item = (await c.getItems()).find((i) => i.id === p.itemId)
        if (!item)
          throw new BridgeError(
            "RESOURCE_NOT_FOUND",
            "CMS item no longer exists",
            false,
          )
        const before = await this.itemSnapshot(item)
        if (before.truncated)
          throw new BridgeError(
            "PROPERTY_UNSUPPORTED",
            "Oversized CMS items cannot be safely edited by this tool",
            false,
          )
        if (before.revision !== p.expected.revision)
          throw new BridgeError(
            "PRECONDITION_FAILED",
            "CMS item changed since inspection",
            false,
          )
        if (
          Object.entries(p.fields).every(
            ([k, v]) =>
              item?.fields[k]?.type === v.type &&
              item.fields[k]?.value === v.value,
          )
        )
          return { changed: false, snapshot: before, warnings: [] }
        c = await this.collection(p.collectionId)
        await validate()
        item = (await c.getItems()).find((i) => i.id === p.itemId)
        if (
          !item ||
          (await this.itemSnapshot(item)).revision !== before.revision
        )
          throw new BridgeError(
            "PRECONDITION_FAILED",
            "CMS item changed during validation",
            false,
          )
        await this.assertContext(scope)
        this.host.guard(context)
        if (dryRun) return { changed: false, snapshot: before, warnings: [] }
        try {
          if (!(await item.setFields(p.fields))) throw Error()
          const next = (
            await (await this.collection(p.collectionId)).getItems()
          ).find((i) => i.id === p.itemId)
          if (!next) throw Error()
          const after = await this.itemSnapshot(next)
          await this.assertContext(scope)
          if (
            !Object.entries(p.fields).every(
              ([k, v]) =>
                after.fields[k]?.type === v.type &&
                after.fields[k]?.value === v.value,
            )
          )
            throw Error()
          return {
            changed: true,
            snapshot: after,
            warnings: [
              "Only supplied scalar fields were patched. Other fields, draft state, slug and localized values were not requested for replacement.",
            ],
          }
        } catch {
          throw new BridgeError(
            "MUTATION_RESULT_UNKNOWN",
            "CMS edit may have applied; inspect before retrying",
            false,
          )
        }
      }
      case "get_branch":
        return { active: await this.project().getBranch() }
      case "plan_changes": {
        const p = inputSchemas.plan_changes.parse(raw)
        this.expire()
        if (
          [...this.plans.values()].filter((p) =>
            ["pending", "approved", "executing"].includes(p.status),
          ).length >= 8
        )
          throw new BridgeError(
            "CAPABILITY_UNAVAILABLE",
            "Eight live plans are already retained; reject or execute them first",
            false,
          )
        if (new Set(p.operations.map(planTarget)).size !== p.operations.length)
          throw new BridgeError(
            "INVALID_REQUEST",
            "Each plan target must appear once",
            false,
          )
        const scope = await this.context()
        const preview: ChangePlan["preview"] = []
        for (const op of p.operations) {
          const snapshot = (await this.operation(op, context, true)).snapshot
          let before: Record<string, string | null> = {}
          if (op.scope === "base" || op.scope === "breakpoint") {
            const nodeSnapshot = snapshot as DesignNode
            if (op.changes.name !== undefined)
              before.name = nodeSnapshot.name ?? null
            if (op.changes.text)
              before["text.content"] = nodeSnapshot.text?.content ?? null
            for (const key of Object.keys(op.changes.layout ?? {})) {
              const value =
                nodeSnapshot.layout?.[
                  key as keyof NonNullable<DesignNode["layout"]>
                ]
              before[`layout.${key}`] =
                typeof value === "object" && value !== null && "raw" in value
                  ? value.raw
                  : typeof value === "string"
                    ? value
                    : null
            }
            for (const key of Object.keys(op.changes.visual ?? {})) {
              if (key === "backgroundColor") {
                const b = nodeSnapshot.visual?.background
                before[`visual.${key}`] =
                  b?.kind === "literal"
                    ? b.value
                    : b?.kind === "style"
                      ? `style:${b.id}`
                      : null
              } else
                before[`visual.${key}`] =
                  nodeSnapshot.visual?.opacity === undefined
                    ? null
                    : String(nodeSnapshot.visual.opacity)
            }
          } else if (op.scope === "instance") {
            const instance = snapshot as ComponentSnapshot
            before = Object.fromEntries(
              Object.keys(op.controls).map((k) => [
                k,
                JSON.stringify(instance.controls[k]?.value ?? null),
              ]),
            )
          } else if (op.scope === "cms") {
            const item = snapshot as CmsItemSnapshot
            before = Object.fromEntries(
              Object.keys(op.fields).map((k) => [
                k,
                JSON.stringify(item.fields[k]?.value ?? null),
              ]),
            )
          } else if (op.scope === "style") {
            const node = snapshot as DesignNode
            before.styleId =
              op.kind === "color"
                ? node.visual?.background?.kind === "style"
                  ? node.visual.background.id
                  : null
                : (node.text?.style?.id ?? null)
          }
          const ancestry =
            op.scope === "cms"
              ? []
              : await this.host.ancestors(await this.host.resolve(op.node))
          preview.push({
            target: planTarget(op),
            ...(op.scope !== "cms" ? { node: op.node } : {}),
            page: ancestry.find((n) =>
              ["WebPageNode", "DesignPageNode"].includes(n.framerType),
            )
              ? ref(
                  ancestry.find((n) =>
                    ["WebPageNode", "DesignPageNode"].includes(n.framerType),
                  )?.id ?? "",
                  this.sessionId,
                )
              : null,
            breakpoint: ancestry.find((n) => n.isBreakpoint)
              ? ref(
                  ancestry.find((n) => n.isBreakpoint)?.id ?? "",
                  this.sessionId,
                )
              : null,
            name:
              op.scope === "cms"
                ? `${op.collectionId}/${op.itemId}`
                : "name" in snapshot
                  ? (snapshot.name ?? null)
                  : null,
            before,
          })
        }
        await this.assertContext(scope)
        const plan = planSchema.parse({
          id: crypto.randomUUID(),
          title: p.title,
          status: "pending",
          expiresAt: Date.now() + 5 * 60_000,
          context: scope,
          operations: p.operations,
          preview,
          warnings: [
            "Approval is required in the editor plugin. Plans expire after five minutes.",
            "Execution is sequential and can partially apply; there is no atomic transaction or automatic rollback.",
            "Base changes may propagate. Preconditions and branch checks are best-effort, not atomic compare-and-set.",
          ],
        })
        if (bytes(plan) > budget)
          throw new BridgeError(
            "PAYLOAD_TOO_LARGE",
            "Change plan exceeds the review budget",
            false,
          )
        this.plans.set(plan.id, plan)
        if (this.plans.size > 32) {
          const old = [...this.plans.values()].find(
            (p) => !["pending", "approved", "executing"].includes(p.status),
          )
          if (old) this.plans.delete(old.id)
        }
        this.emit()
        return structuredClone(plan)
      }
      case "get_change_plan":
        return structuredClone(
          this.plan(inputSchemas.get_change_plan.parse(raw).planId),
        )
      case "execute_change_plan": {
        const p = inputSchemas.execute_change_plan.parse(raw)
        const plan = this.plan(p.planId)
        if (plan.status !== "approved")
          throw new BridgeError(
            "APPROVAL_REQUIRED",
            "Approve this exact pending plan in the editor before execution; completed plans cannot be replayed",
            false,
          )
        await this.assertContext(plan.context)
        for (const op of plan.operations)
          await this.operation(op, context, true)
        plan.status = "executing"
        this.emit()
        const results: MethodResult<"execute_change_plan">["results"] = []
        let stopped = false
        for (const op of plan.operations) {
          if (stopped) {
            results.push({ ...this.resultTarget(op), status: "skipped" })
            continue
          }
          try {
            this.host.guard(context)
            await this.assertContext(plan.context)
            const result = await this.operation(op, context, false)
            results.push({
              ...this.resultTarget(op),
              status: "verified",
              changed: result.changed,
              revision: result.snapshot.revision,
            })
            this.record(
              this.operationMethod(op),
              "verified",
              undefined,
              plan.id,
            )
          } catch (e) {
            const error =
              e instanceof BridgeError
                ? e
                : new BridgeError(
                    "MUTATION_RESULT_UNKNOWN",
                    "Mutation outcome unavailable; inspect before retrying",
                    false,
                  )
            results.push({
              ...this.resultTarget(op),
              status: "failed",
              code: error.code,
              message: error.message,
            })
            this.record(this.operationMethod(op), "error", error.code, plan.id)
            stopped = true
          }
        }
        const status = stopped
          ? results.some((r) => r.status === "verified" && r.changed)
            ? "partial"
            : "failed"
          : "completed"
        plan.status = status
        this.emit()
        return {
          planId: plan.id,
          status,
          results,
          warnings: [
            "Verified results were read back. A failed operation may have applied when its code is MUTATION_RESULT_UNKNOWN; skipped operations were not started.",
            "No rollback was attempted. Inspect affected nodes before proposing another plan.",
          ],
        }
      }
      case "get_audit_log":
        return {
          entries: structuredClone(this.audit),
          retention: "session_memory",
          truncated: this.auditDropped,
        }
      default:
        throw new BridgeError(
          "INVALID_REQUEST",
          "Unknown project operation",
          false,
        )
    }
  }
  supports(method: Method) {
    return method in projectInputSchemas
  }
}
