import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const server = new McpServer({
  name: "framer-plus",
  version: "0.0.0",
})

server.tool(
  "get_status",
  "Return the current Framer+ MCP server status.",
  {},
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          connected: false,
          plugin: "waiting",
          milestone: "mvp",
        }),
      },
    ],
  }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
