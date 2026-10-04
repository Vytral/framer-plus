import { z } from "zod"
import {
  inputSchemas,
  methodSchema,
  resultSchemas,
  WRITE_METHODS,
} from "./schemas/commands.js"

export const PROTOCOL_VERSION = 4
export const MAX_PAYLOAD_BYTES = 64 * 1024
export const REQUEST_TIMEOUT_MS = 15_000
export const HANDSHAKE_TIMEOUT_MS = 5_000
export const HEARTBEAT_INTERVAL_MS = 10_000

export const capabilitiesSchema = z
  .object({
    projectRead: z.boolean(),
    selectionRead: z.boolean(),
    nodeRead: z.boolean(),
    nodeTreeRead: z.boolean(),
    nodeWrite: z.boolean(),
    responsiveRead: z.boolean(),
    responsiveWrite: z.boolean(),
    componentRead: z.boolean(),
    componentWrite: z.boolean(),
    cmsRead: z.boolean(),
    cmsWrite: z.boolean(),
    branchSupport: z.boolean(),
  })
  .strict()

export type Capabilities = z.infer<typeof capabilitiesSchema>

/** Implemented adapter ceiling; each plugin advertises current permission availability. */
export const BRIDGE_CAPABILITIES: z.infer<typeof capabilitiesSchema> = {
  projectRead: true,
  selectionRead: true,
  nodeRead: true,
  nodeTreeRead: true,
  nodeWrite: true,
  responsiveRead: true,
  responsiveWrite: true,
  componentRead: true,
  componentWrite: true,
  cmsRead: true,
  cmsWrite: true,
  branchSupport: true,
}

export const errorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "AUTHENTICATION_FAILED",
  "PROTOCOL_VERSION_MISMATCH",
  "SESSION_DISCONNECTED",
  "SESSION_ALREADY_CONNECTED",
  "NO_EDITOR_SESSION",
  "MULTIPLE_EDITOR_SESSIONS",
  "BRIDGE_TIMEOUT",
  "PAYLOAD_TOO_LARGE",
  "CAPABILITY_UNAVAILABLE",
  "INTERNAL_ERROR",
  "NODE_NOT_FOUND",
  "PROPERTY_UNSUPPORTED",
  "NODE_TYPE_UNSUPPORTED",
  "BREAKPOINT_NOT_FOUND",
  "BREAKPOINT_WRITE_UNSUPPORTED",
  "PRECONDITION_FAILED",
  "FRAMER_API_ERROR",
  "INVALID_CURSOR",
  "MUTATION_RESULT_UNKNOWN",
  "TREE_LIMIT_REACHED",
  "PLAN_NOT_FOUND",
  "APPROVAL_REQUIRED",
  "OVERRIDE_CLEAR_UNSUPPORTED",
  "RESOURCE_NOT_FOUND",
])
export const protocolErrorSchema = z
  .object({
    code: errorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
  })
  .strict()
export type ProtocolError = z.infer<typeof protocolErrorSchema>

const requestId = z.string().min(1).max(128)
export const helloSchema = z
  .object({
    kind: z.literal("hello"),
    protocolVersion: z.number().int().nonnegative(),
    client: z.literal("framer-plugin"),
    clientVersion: z.string().min(1).max(64),
    sessionId: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    capabilities: capabilitiesSchema,
  })
  .strict()
export const welcomeSchema = z
  .object({
    kind: z.literal("welcome"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    sessionId: z.string().uuid(),
    capabilities: capabilitiesSchema,
  })
  .strict()
export const rejectionSchema = z
  .object({
    kind: z.literal("rejected"),
    error: protocolErrorSchema,
  })
  .strict()
export const requestSchema = z
  .object({
    kind: z.literal("request"),
    id: requestId,
    method: methodSchema,
    params: z.unknown(),
    deadlineAt: z.number().finite().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!inputSchemas[value.method].safeParse(value.params).success)
      context.addIssue({ code: "custom", message: "Invalid method parameters" })
    if (WRITE_METHODS.has(value.method) && value.deadlineAt === undefined)
      context.addIssue({
        code: "custom",
        message: "Mutations require a deadline",
      })
  })
export const responseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      kind: z.literal("response"),
      id: requestId,
      ok: z.literal(true),
      result: z.union([
        resultSchemas.ping,
        resultSchemas.get_project,
        resultSchemas.get_pages,
        resultSchemas.get_selection,
        resultSchemas.get_node,
        resultSchemas.get_node_tree,
        resultSchemas.update_node,
        resultSchemas.get_breakpoints,
        resultSchemas.get_responsive_state,
        resultSchemas.get_components,
        resultSchemas.get_component,
        resultSchemas.update_instance,
        resultSchemas.clear_instance_override,
        resultSchemas.get_styles,
        resultSchemas.get_assets,
        resultSchemas.apply_style,
        resultSchemas.get_collections,
        resultSchemas.get_collection_schema,
        resultSchemas.get_collection_items,
        resultSchemas.update_collection_item,
        resultSchemas.get_branch,
        resultSchemas.plan_changes,
        resultSchemas.get_change_plan,
        resultSchemas.execute_change_plan,
        resultSchemas.get_audit_log,
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("response"),
      id: requestId,
      ok: z.literal(false),
      error: protocolErrorSchema,
    })
    .strict(),
])
export const eventSchema = z
  .object({
    kind: z.literal("event"),
    event: z.literal("session.closing"),
    payload: z.object({ reason: z.literal("server_shutdown") }).strict(),
  })
  .strict()
export const bridgeMessageSchema = z.union([
  helloSchema,
  welcomeSchema,
  rejectionSchema,
  requestSchema,
  responseSchema,
  eventSchema,
])
export type BridgeMessage = z.infer<typeof bridgeMessageSchema>
export type RpcMessage =
  | z.infer<typeof requestSchema>
  | z.infer<typeof responseSchema>

export const connectionConfigSchema = z
  .object({
    url: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value)
        return (
          url.protocol === "wss:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname) &&
          url.pathname === "/bridge" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        )
      }, "Use a secure loopback URL ending in /bridge"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type ConnectionConfig = z.infer<typeof connectionConfigSchema>

/** Parses untrusted text with a byte limit before JSON/schema validation. */
export function parseMessage(text: string): BridgeMessage {
  if (new TextEncoder().encode(text).byteLength > MAX_PAYLOAD_BYTES) {
    throw new BridgeError(
      "PAYLOAD_TOO_LARGE",
      "Bridge message exceeds the payload limit",
      false,
    )
  }
  try {
    return bridgeMessageSchema.parse(JSON.parse(text))
  } catch {
    throw new BridgeError("INVALID_REQUEST", "Malformed bridge message", false)
  }
}

export class BridgeError extends Error implements ProtocolError {
  constructor(
    public readonly code: ProtocolError["code"],
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = "BridgeError"
  }
  toJSON(): ProtocolError {
    return { code: this.code, message: this.message, retryable: this.retryable }
  }
}
