import { z } from "zod"
import {
  breakpointSchema,
  mutationPatchSchema,
  mutationResultSchema,
  nodeRefSchema,
  nodeSchema,
  projectSchema,
  responsivePropertyNameSchema,
  responsiveSchema,
  selectionSchema,
  treeSchema,
} from "./design.js"
import { projectInputSchemas, projectResultSchemas } from "./project.js"

const sessionId = z.string().uuid().optional()
const nodeInput = z.object({ sessionId, node: nodeRefSchema }).strict()
export const inputSchemas = {
  ...projectInputSchemas,
  ping: z.object({}).strict(),
  get_project: z.object({ sessionId }).strict(),
  get_selection: z.object({ sessionId }).strict(),
  get_node: nodeInput
    .extend({
      include: z
        .array(z.enum(["layout", "visual", "text"]))
        .max(3)
        .optional(),
    })
    .strict(),
  get_node_tree: z
    .object({
      sessionId,
      root: nodeRefSchema.optional(),
      depth: z.number().int().min(0).max(10).optional(),
      maxNodes: z.number().int().min(1).max(200).optional(),
      include: z
        .array(z.enum(["layout", "visual", "text"]))
        .max(3)
        .optional(),
      cursor: z.string().uuid().optional(),
    })
    .strict(),
  update_node: nodeInput
    .extend({
      scope: z.literal("base"),
      changes: mutationPatchSchema,
      expected: z
        .object({ revision: z.string().min(1).max(128) })
        .strict()
        .optional(),
    })
    .strict(),
  get_breakpoints: z
    .object({ sessionId, page: nodeRefSchema.optional() })
    .strict(),
  get_responsive_state: nodeInput
    .extend({
      properties: z
        .array(responsivePropertyNameSchema)
        .min(1)
        .max(8)
        .optional(),
    })
    .strict(),
  set_breakpoint_override: nodeInput
    .extend({
      breakpoint: nodeRefSchema,
      changes: mutationPatchSchema,
      expected: z
        .object({ revision: z.string().min(1).max(128) })
        .strict()
        .optional(),
    })
    .strict(),
  clear_breakpoint_override: nodeInput
    .extend({
      breakpoint: nodeRefSchema,
      property: responsivePropertyNameSchema,
    })
    .strict(),
}
export const resultSchemas = {
  ...projectResultSchemas,
  ping: z.object({ alive: z.literal(true) }).strict(),
  get_project: projectSchema,
  get_selection: selectionSchema,
  get_node: nodeSchema,
  get_node_tree: treeSchema,
  update_node: mutationResultSchema,
  get_breakpoints: z
    .object({
      page: nodeRefSchema,
      breakpoints: z.array(breakpointSchema).max(200),
      truncated: z.boolean(),
    })
    .strict(),
  get_responsive_state: responsiveSchema,
  set_breakpoint_override: mutationResultSchema,
  clear_breakpoint_override: mutationResultSchema,
}
export type Method = keyof typeof inputSchemas
export type MethodInput<M extends Method> = z.infer<(typeof inputSchemas)[M]>
export type MethodResult<M extends Method> = z.infer<(typeof resultSchemas)[M]>
export const methodSchema = z.enum(
  Object.keys(inputSchemas) as [Method, ...Method[]],
)
export const WRITE_METHODS: ReadonlySet<Method> = new Set([
  "update_instance",
  "apply_style",
  "update_collection_item",
  "execute_change_plan",
  "update_node",
  "set_breakpoint_override",
  "clear_breakpoint_override",
])
