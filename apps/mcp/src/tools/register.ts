import {
  BridgeError,
  inputSchemas,
  type Method,
  WRITE_METHODS,
} from "@framer-plus/protocol"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ZodRawShape } from "zod"
import type { EditorBridge } from "../bridge/server.js"

const descriptions: Record<Exclude<Method, "ping">, string> = {
  get_pages:
    "Enumerate web/design pages across the project, with paths, active-canvas flag and session-scoped references. Follow nextOffset; inspect a page using get_node_tree root. No editor navigation or writes.",
  get_components:
    "List normalized component definitions, paginated live observations.",
  get_component:
    "Inspect a component definition or instance, resolve its definition by identifier, read concrete variant frames and primitive controls. Selected variant axes and per-control override provenance can be unavailable.",
  update_instance:
    "Patch existing primitive control values on one explicit non-replica component instance. Requires its component revision. Variables, bindings, objects, events and slots are unsupported. Reads back the instance.",
  clear_instance_override:
    "Returns OVERRIDE_CLEAR_UNSUPPORTED: the public API does not expose per-control override reset.",
  get_styles:
    "List existing color or text styles for reuse. This does not edit shared styles.",
  get_assets:
    "List referenced background images with bounded consumers, or SVG node byte-length metadata. Not a complete asset library or download operation.",
  apply_style:
    "Bind an existing color style to a base frame or text style to a base text node. Requires inspected node revision. Rejects component/replica/locked scopes. Never edits the shared style itself.",
  get_collections:
    "List CMS collections with ownership and current write permissions, paginated live data.",
  get_collection_schema:
    "Read bounded CMS field definitions and supported scalar write capabilities.",
  get_collection_items:
    "Read paginated CMS items; complex values and oversized data are explicit unavailable/truncated fields. Revisions are best-effort observations.",
  update_collection_item:
    "Patch supplied string/number/boolean fields on an existing user-managed CMS item, with required revision. Rejects bound fields, managed collections and unsupported values. Does not create, delete, publish or edit locale data.",
  get_branch:
    "Read active branch identity. Never creates, switches, merges or publishes branches.",
  plan_changes:
    "Dry-run up to ten distinct targets across pages/views with explicit revisions: base/breakpoint node changes, instance controls, existing style bindings or scalar CMS patches. Returns a five-minute plan for user approval in the editor plugin; performs no native write.",
  get_change_plan: "Read a session-local plan, approval and execution status.",
  execute_change_plan:
    "Execute an exact approved plan once. Revalidate all targets before first write; stop on first failure with explicit verified/failed/skipped outcomes. Sequential, not atomic; no rollback or retry.",
  get_audit_log:
    "Read up to 100 content-free operation outcomes retained only in this plugin session memory.",
  get_project:
    "Read the open Framer project and active canvas root. No project-wide traversal.",
  get_selection:
    "Read compact normalized summaries of the current selection, with explicit truncation.",
  get_node:
    "Inspect a Framer node, relationships, layout sizing intent, text preview, visual data and supported properties. Includes a best-effort revision fingerprint.",
  get_node_tree:
    "Read a bounded live subtree (default depth 3, at most 50 nodes). Continue with next cursor using only cursor, sessionId and maxNodes. Depth-boundary roots can be inspected progressively; this is not an atomic snapshot.",
  update_node:
    "Update allowlisted properties on a base node with explicit scope=base. Base changes may propagate to replicas. Text replacement is a separate plain-text operation. Prefer expected.revision from get_node. Reads back state; never blindly retry a timed-out mutation.",
  get_breakpoints:
    "List the real breakpoint frames of an explicit web page or active web page. Does not confuse breakpoint suggestions with existing breakpoints.",
  get_responsive_state:
    "Read effective exposed properties and replica/breakpoint identity. Override flags, inheritance sources on replicas and effective node fontSize are unavailable and reported as unknown; equal values do not prove inheritance.",
  set_breakpoint_override:
    "Write allowlisted layout/visual properties on an explicit replica inside the requested non-primary breakpoint. Verify primary node remains unchanged. Target must already be a replica; base node IDs are never remapped by guesswork. Cannot set node fontSize or text content.",
  clear_breakpoint_override:
    "Reports BREAKPOINT_WRITE_UNSUPPORTED: the public Framer Plugin API cannot remove a per-property override. Never copies a base value to fake inheritance restoration.",
}

const parameterDescriptions: Record<string, string> = {
  sessionId:
    "Editor session from get_status. Required when multiple editors are connected.",
  node: "Exact session-scoped node reference returned by inspection; do not invent or remap IDs.",
  root: "Page or node reference to inspect. Defaults to the active canvas root.",
  page: "Web page reference from get_pages; defaults to the active web page.",
  breakpoint:
    "Exact non-primary breakpoint reference from get_breakpoints containing the target replica.",
  include:
    "Optional property groups; omit expensive groups when only hierarchy is needed.",
  depth:
    "Traversal depth, 0–10. Inspect depthBoundaryRoots separately to reach deeper descendants.",
  maxNodes:
    "Requested node budget; actual response can stop earlier at its byte limit.",
  cursor:
    "Opaque next cursor from the previous tree page. Do not combine with root/depth/include.",
  offset:
    "Start offset from nextOffset; live pagination can shift if the project changes.",
  limit:
    "Maximum items requested; actual page is also bounded by response bytes.",
  expected:
    "Revision from the corresponding fresh inspection. Stale revisions reject before writing.",
  scope: "Explicit target scope; base may propagate to responsive replicas.",
  changes: "Allowlisted partial patch. Omitted fields remain unchanged.",
  controls:
    "Patch existing primitive controls discovered through get_component.",
  collectionId: "Collection ID from get_collections.",
  itemId: "Existing record ID from get_collection_items.",
  fields: "Patch supported scalar field IDs/types from get_collection_schema.",
  styleId:
    "Existing style ID from get_styles; links the style without editing its definition.",
  kind: "Resource category to inspect or bind.",
  operations:
    "Up to ten distinct targets with revisions and explicit base/breakpoint/instance/style/cms scopes. Reviewed together, executed sequentially.",
  title:
    "Human-readable purpose displayed with the exact operations in the approval UI.",
  planId:
    "Session-local plan ID from plan_changes. Plans expire; inspect again after expiry.",
  property:
    "Exposed responsive property to inspect or reset; reset can be API-unsupported.",
}

export function registerEditorTools(
  server: McpServer,
  bridge: EditorBridge,
): void {
  for (const method of Object.keys(descriptions) as Array<
    Exclude<Method, "ping">
  >) {
    server.registerTool(
      method,
      {
        description: descriptions[method],
        inputSchema: Object.fromEntries(
          Object.entries(inputSchemas[method].shape).map(([key, schema]) => [
            key,
            parameterDescriptions[key]
              ? schema.describe(parameterDescriptions[key])
              : schema,
          ]),
        ) as ZodRawShape,
        annotations: {
          readOnlyHint: !WRITE_METHODS.has(method),
          destructiveHint: false,
          idempotentHint:
            !WRITE_METHODS.has(method) && method !== "plan_changes",
          openWorldHint: false,
        },
      },
      async (raw) => {
        try {
          const params = inputSchemas[method].parse(raw)
          const result = await bridge.request(method, params)
          if (WRITE_METHODS.has(method))
            console.error(
              JSON.stringify({
                event: "mutation",
                method,
                outcome:
                  method === "execute_change_plan" && "status" in result
                    ? result.status
                    : "verified",
                at: new Date().toISOString(),
              }),
            )
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
          }
        } catch (error) {
          const failure =
            error instanceof BridgeError
              ? error
              : new BridgeError(
                  "INVALID_REQUEST",
                  "Invalid tool request",
                  false,
                )
          if (WRITE_METHODS.has(method))
            console.error(
              JSON.stringify({
                event: "mutation",
                method,
                outcome: "error",
                code: failure.toJSON().code,
                at: new Date().toISOString(),
              }),
            )
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: failure.toJSON() }),
              },
            ],
          }
        }
      },
    )
  }
}
