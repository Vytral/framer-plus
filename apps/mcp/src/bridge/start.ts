import { randomBytes } from "node:crypto"
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { createServer } from "node:https"
import { homedir } from "node:os"
import { join } from "node:path"
import { EditorBridge } from "./server.js"

/** Starts a TLS-only loopback bridge and writes the per-run pairing credential privately. */
export async function startBridge() {
  const port = Number(process.env.FRAMER_PLUS_BRIDGE_PORT ?? 5174)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(
      "FRAMER_PLUS_BRIDGE_PORT must be an integer from 1 to 65535",
    )
  const origins = (
    process.env.FRAMER_PLUS_PLUGIN_ORIGINS ??
    "https://localhost:5173,https://127.0.0.1:5173"
  ).split(",")
  for (const origin of origins) {
    const parsed = new URL(origin)
    if (parsed.protocol !== "https:" || parsed.origin !== origin)
      throw new Error(
        "FRAMER_PLUS_PLUGIN_ORIGINS must contain exact HTTPS origins, separated by commas",
      )
  }
  const certPath =
    process.env.FRAMER_PLUS_TLS_CERT ??
    join(homedir(), ".vite-plugin-mkcert", "cert.pem")
  const keyPath =
    process.env.FRAMER_PLUS_TLS_KEY ??
    join(homedir(), ".vite-plugin-mkcert", "dev.pem")
  let cert: Buffer, key: Buffer
  try {
    ;[cert, key] = await Promise.all([readFile(certPath), readFile(keyPath)])
  } catch {
    throw new Error(
      "Bridge TLS certificate unavailable. Run pnpm dev:plugin to set up mkcert, or set FRAMER_PLUS_TLS_CERT and FRAMER_PLUS_TLS_KEY.",
    )
  }
  const server = createServer({ cert, key }, (_request, response) => {
    response.writeHead(404, { "Content-Type": "text/plain" })
    response.end("Not found")
  })
  server.headersTimeout = 5_000
  server.requestTimeout = 5_000
  server.setTimeout(10_000)
  const token = randomBytes(32).toString("hex")
  const bridge = new EditorBridge(server, {
    token,
    allowedOrigins: origins,
    onEvent: (event) => console.error(JSON.stringify(event)),
  })
  const directory = join(homedir(), ".config", "framer-plus")
  const connectionFile = join(directory, `connection-${process.pid}.json`)
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject)
        resolve()
      })
    })
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await chmod(directory, 0o700)
    await writeFile(
      connectionFile,
      `${JSON.stringify({ url: `wss://127.0.0.1:${port}/bridge`, token }, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    )
  } catch (error) {
    await bridge.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE")
      throw new Error(
        `Bridge port ${port} is in use. Stop the other MCP process or set FRAMER_PLUS_BRIDGE_PORT.`,
      )
    throw new Error(
      "Unable to start bridge or create the private connection file",
    )
  }
  server.on("error", () => {
    console.error("Framer+ bridge listener failed")
    void close()
  })
  let closing: Promise<void> | undefined
  function close(): Promise<void> {
    closing ??= (async () => {
      await bridge.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await unlink(connectionFile).catch(() => {})
    })()
    return closing
  }
  return { bridge, connectionFile, close }
}
