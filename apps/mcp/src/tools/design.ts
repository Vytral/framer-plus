import { homedir } from "node:os"
import { join } from "node:path"
import {
  compareDesigns,
  ExportBlocked,
  exportOptionsSchema,
  RELEASE_VERSION,
  roleSchema,
} from "@framer-plus/design"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { EditorBridge } from "../bridge/server.js"
import { ArtifactStore } from "../design/artifacts.js"
import { captureDesign } from "../design/capture.js"
export function registerDesignTools(
  server: McpServer,
  bridge: EditorBridge,
  store = new ArtifactStore(
    process.env.FRAMER_PLUS_ARTIFACT_DIR ??
      join(homedir(), ".local", "share", "framer-plus", "artifacts"),
  ),
) {
  const digest = z.string().regex(/^[a-f0-9]{64}$/)
  const definitions = {
    capture_design: {
      description:
        "Capture the active canvas with best-effort revision verification into a private local snapshot and Design IR v1. Does not change Framer. Incomplete/unsupported data remains explicit. Stores design data locally.",
      schema: z
        .object({
          sessionId: z.string().uuid().optional(),
          maxNodes: z.number().int().min(1).max(500).default(200),
          roles: z.record(z.string().min(1).max(256), roleSchema).default({}),
        })
        .strict(),
    },
    inspect_design_artifact: {
      description:
        "Inspect a saved snapshot/IR summary and bounded node slice/diagnostics. Artifacts stay on this machine.",
      schema: z
        .object({
          snapshotId: digest,
          offset: z.number().int().min(0).max(500).default(0),
          limit: z.number().int().min(1).max(20).default(10),
        })
        .strict(),
    },
    generate_react: {
      description:
        "Generate a standalone React/Vite project from saved IR in a new local artifact directory. Unsupported semantics block by default. Responsive mode requires explicit non-overlapping ranges; unknown typography/components remain annotated. Never downloads assets or publishes.",
      schema: z
        .object({
          snapshotId: digest,
          options: exportOptionsSchema.default({}),
        })
        .strict(),
    },
    compare_design_artifacts: {
      description:
        "Compare saved IR nodes from the same project/branch, reporting added/removed/changed source IDs. This is structural comparison, not visual pixel comparison or code reverse engineering.",
      schema: z.object({ before: digest, after: digest }).strict(),
    },
    regenerate_react: {
      description:
        "Regenerate into a new local directory using a previous export baseline. Preserve compatible user edits and report same-file conflicts before writing. Previous directory stays untouched. node_modules/dist/.git are not copied; install dependencies in the new output.",
      schema: z
        .object({
          previousExportId: z.string().uuid(),
          snapshotId: digest,
          options: exportOptionsSchema.default({}),
        })
        .strict(),
    },
  }
  for (const [name, definition] of Object.entries(definitions))
    server.registerTool(
      name,
      {
        description: definition.description,
        inputSchema: definition.schema.shape,
        annotations: {
          readOnlyHint: ![
            "capture_design",
            "generate_react",
            "regenerate_react",
          ].includes(name),
          destructiveHint: false,
          idempotentHint: [
            "inspect_design_artifact",
            "compare_design_artifacts",
          ].includes(name),
          openWorldHint: false,
        },
      },
      async (raw: unknown) => {
        try {
          let result: unknown
          switch (name) {
            case "capture_design": {
              const p = definitions.capture_design.schema.parse(raw)
              const capture = await captureDesign(
                bridge,
                p.sessionId,
                p.maxNodes,
                p.roles,
              )
              const saved = await store.save(capture.snapshot, capture.ir)
              result = {
                snapshotId: saved.id,
                path: saved.path,
                schemaVersion: 1,
                version: RELEASE_VERSION,
                nodeCount: capture.ir.nodes.length,
                capture: capture.ir.capture,
                diagnostics: capture.ir.diagnostics.slice(0, 20),
                diagnosticCount: capture.ir.diagnostics.length,
              }
              break
            }
            case "inspect_design_artifact": {
              const p = definitions.inspect_design_artifact.schema.parse(raw)
              const { ir } = await store.load(p.snapshotId)
              const nodes = ir.nodes.slice(p.offset, p.offset + p.limit)
              result = {
                snapshotId: p.snapshotId,
                project: ir.project,
                schemaVersion: ir.schemaVersion,
                capture: ir.capture,
                nodes,
                nextOffset:
                  p.offset + nodes.length < ir.nodes.length
                    ? p.offset + nodes.length
                    : null,
                diagnostics: ir.diagnostics.slice(0, 20),
                diagnosticCount: ir.diagnostics.length,
              }
              break
            }
            case "generate_react": {
              const p = definitions.generate_react.schema.parse(raw)
              const output = await store.generate(p.snapshotId, p.options)
              result = {
                exportId: output.id,
                path: output.path,
                files: Object.keys(output.manifest.files),
                diagnostics: output.manifest.diagnostics.slice(0, 20),
                diagnosticCount: output.manifest.diagnostics.length,
              }
              break
            }
            case "compare_design_artifacts": {
              const p = definitions.compare_design_artifacts.schema.parse(raw)
              const [before, after] = await Promise.all([
                store.load(p.before),
                store.load(p.after),
              ])
              const changes = compareDesigns(before.ir, after.ir)
              result = {
                changes: changes.slice(0, 200),
                total: changes.length,
                truncated: changes.length > 200,
              }
              break
            }
            case "regenerate_react": {
              const p = definitions.regenerate_react.schema.parse(raw)
              const output = await store.regenerate(
                p.previousExportId,
                p.snapshotId,
                p.options,
              )
              result =
                output.status === "conflict"
                  ? output
                  : {
                      status: output.status,
                      exportId: output.id,
                      path: output.path,
                      diagnostics: output.manifest.diagnostics.slice(0, 20),
                      diagnosticCount: output.manifest.diagnostics.length,
                    }
              break
            }
          }
          const content = JSON.stringify(result)
          if (Buffer.byteLength(content) > 48 * 1024)
            throw Error(
              "Artifact response exceeds the inspection budget; choose fewer nodes",
            )
          return { content: [{ type: "text" as const, text: content }] }
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  error instanceof ExportBlocked
                    ? {
                        error: {
                          code: "EXPORT_UNSUPPORTED",
                          message: error.message,
                          diagnostics: error.diagnostics.slice(0, 20),
                          total: error.diagnostics.length,
                        },
                      }
                    : {
                        error: {
                          code: "DESIGN_WORKFLOW_FAILED",
                          message:
                            error instanceof Error
                              ? error.message.slice(0, 512)
                              : "Design workflow failed",
                        },
                      },
                ),
              },
            ],
          }
        }
      },
    )
}
