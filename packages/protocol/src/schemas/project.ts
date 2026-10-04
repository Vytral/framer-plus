import { z } from "zod"
import { mutationPatchSchema, nodeRefSchema, nodeSchema } from "./design.js"

const id = z.string().min(1).max(256)
const text = z.string().max(4096)
export const scalarSchema = z.union([text, z.number().finite(), z.boolean()])
const record = <T extends z.ZodTypeAny>(value: T) =>
  z.record(z.string().min(1).max(256), value).superRefine((v, c) => {
    if (
      Object.keys(v).length > 100 ||
      Object.keys(v).some((k) =>
        ["__proto__", "prototype", "constructor"].includes(k),
      )
    )
      c.addIssue({
        code: "custom",
        message: "Unsafe or oversized property map",
      })
  })
export const scalarMapSchema = record(scalarSchema)
export const componentSchema = z
  .object({
    node: nodeRefSchema,
    kind: z.enum(["definition", "instance"]),
    name: z.string().max(512).nullable(),
    identifier: id,
    definition: nodeRefSchema.nullable(),
    resolution: z.enum(["resolved", "external_or_unavailable", "ambiguous"]),
    support: z
      .object({
        variantAxes: z.literal(false),
        overrideRead: z.literal(false),
        overrideClear: z.literal(false),
      })
      .strict(),
    controls: record(
      z
        .object({
          value: scalarSchema.nullable(),
          available: z.boolean(),
          writable: z.boolean(),
          override: z.literal("unknown"),
        })
        .strict(),
    ),
    variants: z
      .array(
        z
          .object({
            node: nodeRefSchema,
            name: z.string().max(512).nullable(),
            primary: z.boolean(),
            gesture: z.string().max(64).nullable(),
            inheritsFrom: nodeRefSchema.nullable(),
          })
          .strict(),
      )
      .max(100),
    truncated: z.boolean(),
    revision: id,
    warnings: z.array(text).max(20),
  })
  .strict()
export const colorStyleSchema = z
  .object({ id, name: z.string().max(512), light: text, dark: text.nullable() })
  .strict()
export const textStyleSchema = z
  .object({
    id,
    name: z.string().max(512),
    fontSize: z.string().max(128),
    minWidth: z.number().finite(),
    breakpoints: z
      .array(
        z
          .object({
            minWidth: z.number().finite(),
            fontSize: z.string().max(128),
          })
          .strict(),
      )
      .max(32),
    truncated: z.boolean(),
  })
  .strict()
export const svgAssetSchema = z
  .object({
    id,
    node: nodeRefSchema,
    byteLength: z.number().int().nonnegative(),
  })
  .strict()
export const assetSchema = z
  .object({
    id,
    url: z.string().max(4096),
    nodes: z.array(nodeRefSchema).max(100),
  })
  .strict()
export const fieldSchema = z
  .object({
    id,
    name: z.string().max(512),
    type: z.string().max(128),
    writable: z.boolean(),
    required: z.boolean(),
    basedOn: id.nullable(),
  })
  .strict()
export const collectionSchema = z
  .object({
    id,
    name: z.string().max(512),
    managedBy: z.enum(["user", "thisPlugin", "anotherPlugin"]),
    writable: z.boolean(),
  })
  .strict()
export const itemSchema = z
  .object({
    id,
    slug: z.string().max(512),
    draft: z.boolean(),
    fields: record(
      z
        .object({
          type: z.string().max(128),
          value: scalarSchema.nullable(),
          available: z.boolean(),
        })
        .strict(),
    ),
    revision: id,
    truncated: z.boolean(),
  })
  .strict()
export const branchSchema = z
  .object({
    id,
    title: z.string().max(512),
    baseId: id.nullable(),
    joined: z.boolean(),
  })
  .strict()
export const cmsPatchSchema = record(
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("string"), value: text }).strict(),
    z
      .object({ type: z.literal("number"), value: z.number().finite() })
      .strict(),
    z.object({ type: z.literal("boolean"), value: z.boolean() }).strict(),
  ]),
).refine((v) => Object.keys(v).length > 0, "At least one field is required")
export const nodePlanOperationSchema = z
  .object({
    node: nodeRefSchema,
    scope: z.enum(["base", "breakpoint"]),
    breakpoint: nodeRefSchema.optional(),
    changes: mutationPatchSchema,
    expected: z.object({ revision: id }).strict(),
  })
  .strict()
  .superRefine((v, c) => {
    if ((v.scope === "breakpoint") !== Boolean(v.breakpoint))
      c.addIssue({
        code: "custom",
        message: "Breakpoint reference must match scope",
      })
  })
export const planOperationSchema = z.union([
  nodePlanOperationSchema,
  z
    .object({
      scope: z.literal("instance"),
      node: nodeRefSchema,
      controls: scalarMapSchema.refine((v) => Object.keys(v).length > 0),
      expected: z.object({ revision: id }).strict(),
    })
    .strict(),
  z
    .object({
      scope: z.literal("style"),
      node: nodeRefSchema,
      kind: z.enum(["color", "text"]),
      styleId: id,
      expected: z.object({ revision: id }).strict(),
    })
    .strict(),
  z
    .object({
      scope: z.literal("cms"),
      collectionId: id,
      itemId: id,
      fields: cmsPatchSchema,
      expected: z.object({ revision: id }).strict(),
    })
    .strict(),
])
export function planTarget(op: z.infer<typeof planOperationSchema>): string {
  return op.scope === "cms"
    ? JSON.stringify(["cms", op.collectionId, op.itemId])
    : JSON.stringify(["node", op.node.id])
}
export type NodePlanOperation = z.infer<typeof nodePlanOperationSchema>
export const planSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(120),
    status: z.enum([
      "pending",
      "approved",
      "rejected",
      "executing",
      "completed",
      "partial",
      "failed",
      "expired",
    ]),
    expiresAt: z.number().finite(),
    context: z.object({ projectId: id, branchId: id.nullable() }).strict(),
    operations: z.array(planOperationSchema).min(1).max(10),
    preview: z
      .array(
        z
          .object({
            target: z.string().max(1024),
            node: nodeRefSchema.optional(),
            page: nodeRefSchema.nullable(),
            breakpoint: nodeRefSchema.nullable(),
            name: z.string().max(512).nullable(),
            before: record(text.nullable()),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    warnings: z.array(text).max(20),
  })
  .strict()
export const batchResultSchema = z
  .object({
    planId: z.string().uuid(),
    status: z.enum(["completed", "partial", "failed"]),
    results: z
      .array(
        z
          .object({
            target: z.string().max(1024),
            node: nodeRefSchema.optional(),
            collectionId: id.optional(),
            itemId: id.optional(),
            status: z.enum(["verified", "failed", "skipped"]),
            changed: z.boolean().optional(),
            revision: id.optional(),
            code: z.string().max(64).optional(),
            message: z.string().max(512).optional(),
          })
          .strict(),
      )
      .max(10),
    warnings: z.array(text).max(20),
  })
  .strict()
export const auditEntrySchema = z
  .object({
    id: z.string().uuid(),
    at: z.number().finite(),
    method: z.string().max(64),
    outcome: z.enum(["verified", "error"]),
    code: z.string().max(64).optional(),
    planId: z.string().uuid().optional(),
  })
  .strict()
const sessionId = z.string().uuid().optional()
const targeted = z.object({ sessionId, node: nodeRefSchema }).strict()
const page = z
  .object({
    sessionId,
    offset: z.number().int().min(0).max(100000).default(0),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict()
const list = <T extends z.ZodTypeAny>(s: T) =>
  z
    .object({
      items: z.array(s).max(100),
      nextOffset: z.number().int().nullable(),
      truncated: z.boolean(),
      live: z.literal(true),
    })
    .strict()
export const projectInputSchemas = {
  get_pages: page
    .extend({ kind: z.enum(["web", "design", "all"]).default("web") })
    .strict(),
  get_components: page,
  get_component: targeted,
  update_instance: targeted
    .extend({
      scope: z.literal("instance"),
      controls: scalarMapSchema.refine((v) => Object.keys(v).length > 0),
      expected: z.object({ revision: id }).strict(),
    })
    .strict(),
  clear_instance_override: targeted.extend({ property: id }).strict(),
  get_styles: page.extend({ kind: z.enum(["color", "text"]) }).strict(),
  get_assets: page
    .extend({ kind: z.enum(["image", "svg"]).default("image") })
    .strict(),
  apply_style: targeted
    .extend({
      scope: z.literal("base"),
      kind: z.enum(["color", "text"]),
      styleId: id,
      expected: z.object({ revision: id }).strict(),
    })
    .strict(),
  get_collections: page,
  get_collection_schema: z.object({ sessionId, collectionId: id }).strict(),
  get_collection_items: page.extend({ collectionId: id }).strict(),
  update_collection_item: z
    .object({
      sessionId,
      collectionId: id,
      itemId: id,
      fields: cmsPatchSchema,
      expected: z.object({ revision: id }).strict(),
    })
    .strict(),
  get_branch: z.object({ sessionId }).strict(),
  plan_changes: z
    .object({
      sessionId,
      title: z.string().min(1).max(120),
      operations: z.array(planOperationSchema).min(1).max(10),
    })
    .strict(),
  get_change_plan: z.object({ sessionId, planId: z.string().uuid() }).strict(),
  execute_change_plan: z
    .object({ sessionId, planId: z.string().uuid() })
    .strict(),
  get_audit_log: z.object({ sessionId }).strict(),
}
export const projectResultSchemas = {
  get_pages: list(
    z
      .object({
        ref: nodeRefSchema,
        name: z.string().max(512).nullable(),
        kind: z.enum(["web", "design"]),
        path: z.string().max(4096).nullable(),
        active: z.boolean(),
      })
      .strict(),
  ),
  get_components: list(componentSchema),
  get_component: componentSchema,
  update_instance: z
    .object({
      changed: z.boolean(),
      snapshot: componentSchema,
      warnings: z.array(text).max(20),
    })
    .strict(),
  clear_instance_override: z.object({ unsupported: z.literal(true) }).strict(),
  get_styles: list(z.union([colorStyleSchema, textStyleSchema])),
  get_assets: list(z.union([assetSchema, svgAssetSchema])),
  apply_style: z
    .object({
      changed: z.boolean(),
      snapshot: nodeSchema,
      warnings: z.array(text).max(20),
    })
    .strict(),
  get_collections: list(collectionSchema),
  get_collection_schema: z
    .object({
      collection: collectionSchema,
      fields: z.array(fieldSchema).max(100),
      truncated: z.boolean(),
    })
    .strict(),
  get_collection_items: list(itemSchema),
  update_collection_item: z
    .object({
      changed: z.boolean(),
      snapshot: itemSchema,
      warnings: z.array(text).max(20),
    })
    .strict(),
  get_branch: z.object({ active: branchSchema }).strict(),
  plan_changes: planSchema,
  get_change_plan: planSchema,
  execute_change_plan: batchResultSchema,
  get_audit_log: z
    .object({
      entries: z.array(auditEntrySchema).max(100),
      retention: z.literal("session_memory"),
      truncated: z.boolean(),
    })
    .strict(),
}
export type ChangePlan = z.infer<typeof planSchema>
export type PlanOperation = z.infer<typeof planOperationSchema>
export type ComponentSnapshot = z.infer<typeof componentSchema>
export type CmsItemSnapshot = z.infer<typeof itemSchema>
