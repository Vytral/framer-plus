import { RELEASE_VERSION } from "@framer-plus/design"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { startBridge } from "./bridge/start.js"
import { registerDesignTools } from "./tools/design.js"
import { registerEditorTools } from "./tools/register.js"

try {
  const runtime = await startBridge()
  console.error(
    `Framer+ bridge ready. Pair the plugin using: ${runtime.connectionFile}`,
  )
  const server = new McpServer({
    name: "framer-plus",
    version: RELEASE_VERSION,
  })
  server.registerTool(
    "get_status",
    {
      description:
        "Report the local bridge and live Framer editor sessions. Each editor is probed before reporting it as connected.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await runtime.bridge.getStatus()),
        },
      ],
    }),
  )
  registerEditorTools(server, runtime.bridge)
  registerDesignTools(server, runtime.bridge)
  const transport = new StdioServerTransport()
  let shuttingDown: Promise<void> | undefined
  const shutdown = () => {
    shuttingDown ??= (async () => {
      await runtime.close()
      await server.close()
    })()
    return shuttingDown
  }
  process.stdin.once("end", () => {
    void shutdown()
  })
  transport.onclose = () => {
    void runtime.close()
  }
  process.once("SIGINT", () => {
    void shutdown()
  })
  process.once("SIGTERM", () => {
    void shutdown()
  })
  await server.connect(transport)
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unable to start Framer+ MCP",
  )
  process.exitCode = 1
}
