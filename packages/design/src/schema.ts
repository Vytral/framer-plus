import { breakpointSchema, nodeSchema } from "@framer-plus/protocol"
import { z } from "zod"
export const RELEASE_VERSION = "0.1.0-alpha.1"
export const IR_VERSION = 1
const id = z.string().min(1).max(256)
export const diagnosticSchema = z
  .object({
    code: z.string().max(64),
    severity: z.enum(["warning", "unsupported"]),
    nodeId: id.optional(),
    message: z.string().max(512),
  })
  .strict()
export const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    adapter: z.literal("framer-plugin"),
    project: z.object({ id, name: z.string().max(512), branchId: id }).strict(),
    rootId: id,
    nodes: z.array(nodeSchema).min(1).max(500),
    breakpoints: z.array(breakpointSchema).max(100),
    capture: z
      .object({
        atomic: z.literal(false),
        complete: z.boolean(),
        verified: z.boolean(),
        reasons: z.array(z.string().max(128)).max(20),
      })
      .strict(),
  })
  .strict()
export type DesignSnapshot = z.infer<typeof snapshotSchema>
export const roleSchema = z.enum([
  "main",
  "section",
  "header",
  "footer",
  "nav",
  "h1",
  "h2",
  "h3",
  "p",
  "div",
])
export const irNodeSchema = z
  .object({
    id,
    source: z
      .object({
        nodeId: id,
        framerType: z.string().max(128),
        originalId: id.nullable(),
      })
      .strict(),
    name: z.string().max(512).nullable(),
    kind: nodeSchema.shape.type,
    children: z.array(id).max(200),
    layout: nodeSchema.shape.layout,
    visual: nodeSchema.shape.visual,
    text: nodeSchema.shape.text,
    role: roleSchema,
    semanticSource: z.enum(["explicit", "default"]),
    breakpointId: id.nullable(),
  })
  .strict()
export const designIRSchema = z
  .object({
    schemaVersion: z.literal(IR_VERSION),
    producerVersion: z.literal(RELEASE_VERSION),
    project: snapshotSchema.shape.project,
    rootId: id,
    nodes: z.array(irNodeSchema).min(1).max(500),
    breakpoints: z
      .array(
        z
          .object({
            id,
            name: z.string().max(512).nullable(),
            width: breakpointSchema.shape.width,
            primary: z.boolean(),
            inheritsFromId: id.nullable(),
          })
          .strict(),
      )
      .max(100),
    tokens: z
      .array(
        z
          .object({
            id,
            kind: z.enum(["color", "text"]),
            name: z.string().max(512),
            value: z.string().max(512),
            dark: z.string().max(512).nullable(),
            effective: z.boolean(),
          })
          .strict(),
      )
      .max(500),
    reusable: z
      .array(
        z
          .object({
            signature: z.string().max(128),
            nodeIds: z.array(id).min(2).max(500),
          })
          .strict(),
      )
      .max(250),
    diagnostics: z.array(diagnosticSchema).max(5000),
    capture: snapshotSchema.shape.capture,
  })
  .strict()
export type DesignIR = z.infer<typeof designIRSchema>
export type IRNode = z.infer<typeof irNodeSchema>
export type Diagnostic = z.infer<typeof diagnosticSchema>
export const transformOptionsSchema = z
  .object({ roles: z.record(id, roleSchema).default({}) })
  .strict()
export const exportOptionsSchema = z
  .object({
    allowUnsupported: z.boolean().default(false),
    title: z.string().min(1).max(120).default("Framer export"),
    mode: z.enum(["primary", "responsive"]).default("primary"),
    ranges: z
      .array(
        z
          .object({
            breakpointId: id,
            minWidth: z.number().finite().min(0).max(10000).optional(),
            maxWidth: z.number().finite().min(0).max(10000).optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict()
export type ExportOptions = z.infer<typeof exportOptionsSchema>
export const generatedManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatorVersion: z.literal(RELEASE_VERSION),
    irHash: z.string().regex(/^[a-f0-9]{64}$/),
    projectId: id,
    branchId: id,
    options: exportOptionsSchema,
    files: z.record(
      z.string().min(1).max(200),
      z.string().regex(/^[a-f0-9]{64}$/),
    ),
    sources: z
      .array(
        z
          .object({
            nodeId: id,
            file: z.string().max(200),
            component: z.string().max(128),
            className: z.string().max(128),
          })
          .strict(),
      )
      .max(500),
    diagnostics: z.array(diagnosticSchema).max(5000),
  })
  .strict()
export type GeneratedManifest = z.infer<typeof generatedManifestSchema>
