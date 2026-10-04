import { z } from "zod"

export const nodeRefSchema = z
  .object({
    id: z.string().min(1).max(256),
    sessionId: z.string().uuid().optional(),
  })
  .strict()
export const dimensionSchema = z
  .object({
    mode: z.enum([
      "fixed",
      "percentage",
      "fill",
      "fit-content",
      "fit-image",
      "viewport",
      "unknown",
    ]),
    raw: z.string().max(256).nullable(),
    value: z.number().finite().optional(),
    unit: z.enum(["px", "%", "fr", "vh"]).optional(),
  })
  .strict()
export const colorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: z.string().max(512) }).strict(),
  z
    .object({
      kind: z.literal("style"),
      id: z.string().max(256),
      name: z.string().max(512),
      light: z.string().max(512),
      dark: z.string().max(512).nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("none") }).strict(),
])
export const nodeSchema = z
  .object({
    ref: nodeRefSchema,
    type: z.enum([
      "page",
      "frame",
      "stack",
      "text",
      "image",
      "svg",
      "component",
      "component-instance",
      "unknown",
    ]),
    name: z.string().max(512).nullable().optional(),
    parent: nodeRefSchema.nullable().optional(),
    children: z.array(nodeRefSchema).max(200).optional(),
    childrenTruncated: z.boolean().optional(),
    layout: z
      .object({
        kind: z.enum(["stack", "grid", "none"]).optional(),
        positioning: z.enum(["flow", "absolute", "fixed", "sticky"]).optional(),
        width: dimensionSchema.optional(),
        height: dimensionSchema.optional(),
        minWidth: dimensionSchema.optional(),
        maxWidth: dimensionSchema.optional(),
        minHeight: dimensionSchema.optional(),
        maxHeight: dimensionSchema.optional(),
        gap: z.string().max(256).nullable().optional(),
        padding: z.string().max(256).nullable().optional(),
        direction: z.enum(["horizontal", "vertical"]).nullable().optional(),
        alignment: z.enum(["start", "center", "end"]).nullable().optional(),
        distribution: z.string().max(64).nullable().optional(),
        overflow: z.string().max(64).optional(),
      })
      .strict()
      .optional(),
    visual: z
      .object({
        opacity: z.number().finite().optional(),
        visible: z.boolean().optional(),
        background: colorSchema.optional(),
        image: z
          .object({ id: z.string().max(256), url: z.string().max(2048) })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    text: z
      .object({
        content: z.string().max(4096).nullable(),
        truncated: z.boolean(),
        style: z
          .object({
            id: z.string().max(256),
            name: z.string().max(512),
            fontSize: z.string().max(256),
            minWidth: z.number().finite(),
            breakpoints: z
              .array(
                z
                  .object({
                    minWidth: z.number().finite(),
                    fontSize: z.string().max(256),
                  })
                  .strict(),
              )
              .max(32),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    capabilities: z
      .object({
        read: z.boolean(),
        treeRead: z.boolean(),
        writableProperties: z.array(z.string()).max(16),
        breakpointWritableProperties: z.array(z.string()).max(16),
        clearBreakpointOverride: z.literal(false),
      })
      .strict(),
    metadata: z
      .object({
        framerType: z.string().max(128),
        isReplica: z.boolean(),
        originalId: z.string().max(256).nullable(),
        locked: z.boolean().optional(),
        isVariant: z.boolean().optional(),
        isBreakpoint: z.boolean().optional(),
        isPrimaryBreakpoint: z.boolean().optional(),
        path: z.string().max(1024).nullable().optional(),
      })
      .strict(),
    revision: z.string().max(128),
    warnings: z.array(z.string().max(512)).max(16),
  })
  .strict()
export const breakpointSchema = z
  .object({
    ref: nodeRefSchema,
    name: z.string().max(512).nullable(),
    width: dimensionSchema,
    primary: z.boolean(),
    inheritsFrom: nodeRefSchema.nullable(),
  })
  .strict()
export const projectSchema = z
  .object({
    id: z.string().max(256),
    name: z.string().max(512),
    canvasRoot: nodeRefSchema,
    sessionId: z.string().uuid(),
  })
  .strict()
export const selectionSchema = z
  .object({
    nodes: z
      .array(
        nodeSchema.pick({
          ref: true,
          type: true,
          name: true,
          capabilities: true,
          metadata: true,
        }),
      )
      .max(200),
    total: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict()
export const treeSchema = z
  .object({
    root: nodeRefSchema,
    nodes: z.array(nodeSchema).max(200),
    truncated: z.boolean(),
    reasons: z.array(
      z.enum(["depth", "nodes", "payload", "unsupported", "changed"]),
    ),
    next: z.string().uuid().optional(),
    continuationRoots: z.array(nodeRefSchema).max(200),
    live: z.literal(true),
  })
  .strict()

const sizeSchema = z.union([
  z
    .object({
      mode: z.literal("fixed"),
      value: z.number().finite().min(0).max(100_000),
    })
    .strict(),
  z
    .object({
      mode: z.literal("percentage"),
      value: z.number().finite().min(0).max(1000),
    })
    .strict(),
  z
    .object({
      mode: z.literal("fill"),
      value: z.number().finite().positive().max(100).default(1),
    })
    .strict(),
  z.object({ mode: z.literal("fit-content") }).strict(),
])
const nonEmpty = <T extends z.AnyZodObject>(schema: T) =>
  schema.refine(
    (value) => Object.keys(value).length > 0,
    "Changes must not be empty",
  )
export const mutationPatchSchema = nonEmpty(
  z
    .object({
      name: z.string().min(1).max(512).optional(),
      layout: nonEmpty(
        z
          .object({
            width: sizeSchema.optional(),
            height: sizeSchema.optional(),
            gap: z.number().finite().min(0).max(10_000).optional(),
            padding: z
              .object({
                top: z.number().finite().min(0).max(10_000),
                right: z.number().finite().min(0).max(10_000),
                bottom: z.number().finite().min(0).max(10_000),
                left: z.number().finite().min(0).max(10_000),
              })
              .strict()
              .optional(),
            alignment: z.enum(["start", "center", "end"]).optional(),
          })
          .strict(),
      ).optional(),
      visual: nonEmpty(
        z
          .object({
            opacity: z.number().finite().min(0).max(1).optional(),
            backgroundColor: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)
              .nullable()
              .optional(),
          })
          .strict(),
      ).optional(),
      text: z
        .object({ content: z.string().max(4096) })
        .strict()
        .optional(),
    })
    .strict(),
).refine(
  (value) => !value.text || Object.keys(value).length === 1,
  "Text replacement must be a separate operation",
)
export type MutationPatch = z.infer<typeof mutationPatchSchema>
export const mutationResultSchema = z
  .object({
    changed: z.boolean(),
    node: nodeRefSchema,
    applied: mutationPatchSchema,
    warnings: z.array(z.string().max(512)).max(16),
    snapshot: nodeSchema,
    scope: z.enum(["base", "breakpoint"]),
  })
  .strict()
export const responsivePropertyNameSchema = z.enum([
  "layout.width",
  "layout.height",
  "layout.gap",
  "layout.padding",
  "layout.alignment",
  "visual.opacity",
  "visual.backgroundColor",
  "text.fontSize",
])
export const responsiveSchema = z
  .object({
    node: nodeRefSchema,
    breakpoint: breakpointSchema.nullable(),
    original: nodeRefSchema.nullable(),
    properties: z.record(
      responsivePropertyNameSchema,
      z
        .object({
          effective: z.union([
            z.string().max(512),
            z.number().finite(),
            z.boolean(),
            z.null(),
          ]),
          source: z.object({ kind: z.enum(["base", "unknown"]) }).strict(),
          overrideStatus: z.enum(["unknown", "not_applicable"]),
        })
        .strict(),
    ),
    support: z
      .object({
        overrideRead: z.literal(false),
        overrideSet: z.boolean(),
        overrideClear: z.literal(false),
        nodeFontSize: z.literal(false),
      })
      .strict(),
    warnings: z.array(z.string().max(512)).max(16),
  })
  .strict()

import type { projectResultSchemas } from "./project.js"
export type RpcResult =
  | z.infer<(typeof projectResultSchemas)[keyof typeof projectResultSchemas]>
  | { alive: true }
  | z.infer<typeof projectSchema>
  | z.infer<typeof selectionSchema>
  | z.infer<typeof nodeSchema>
  | z.infer<typeof treeSchema>
  | z.infer<typeof mutationResultSchema>
  | z.infer<typeof responsiveSchema>
  | {
      breakpoints: z.infer<typeof breakpointSchema>[]
      page: z.infer<typeof nodeRefSchema>
      truncated: boolean
    }
