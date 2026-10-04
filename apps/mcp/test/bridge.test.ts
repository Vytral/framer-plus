import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  BRIDGE_CAPABILITIES,
  BridgeError,
  type BridgeMessage,
  MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  parseMessage,
  RpcPeer,
} from "@framer-plus/protocol"
import { WebSocket } from "ws"
import {
  BridgeClient,
  type BrowserSocket,
  type ConnectionState,
} from "../../plugin/src/bridge/client.js"
import { EditorBridge } from "../src/bridge/server.js"

const token = "a".repeat(64)
const origin = "https://localhost:5173"
async function fixture(options = {}) {
  const server = createServer()
  const bridge = new EditorBridge(server, {
    token,
    allowedOrigins: [origin],
    handshakeTimeoutMs: 80,
    requestTimeoutMs: 40,
    heartbeatIntervalMs: 100,
    ...options,
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const url = `ws://127.0.0.1:${address.port}/bridge`
  return {
    bridge,
    url,
    close: async () => {
      await bridge.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
async function connect(url: string) {
  const socket = new WebSocket(url, { origin })
  socket.on("error", () => {})
  await once(socket, "open")
  return socket
}
async function hello(socket: WebSocket, overrides = {}) {
  const reply = once(socket, "message")
  socket.send(
    JSON.stringify({
      kind: "hello",
      protocolVersion: PROTOCOL_VERSION,
      client: "framer-plugin",
      clientVersion: "0.0.0",
      sessionId: randomUUID(),
      token,
      capabilities: BRIDGE_CAPABILITIES,
      ...overrides,
    }),
  )
  const [data] = await reply
  return parseMessage(data.toString())
}
function answerPings(socket: WebSocket) {
  socket.on("message", (data) => {
    const message = parseMessage(data.toString())
    if (message.kind === "request")
      socket.send(
        JSON.stringify({
          kind: "response",
          id: message.id,
          ok: true,
          result: { alive: true },
        }),
      )
  })
}
async function until(predicate: () => boolean, timeout = 1_000) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Condition did not become true")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test("MCP without a plugin reports zero sessions and a retryable error", async () => {
  const f = await fixture()
  try {
    assert.equal((await f.bridge.getStatus()).connected, false)
    await assert.rejects(f.bridge.ping(), {
      code: "NO_EDITOR_SESSION",
      retryable: true,
    })
  } finally {
    await f.close()
  }
})

test("authenticated sessions are probed; multiple sessions require an explicit target", async () => {
  const f = await fixture()
  try {
    const a = await connect(f.url),
      b = await connect(f.url)
    answerPings(a)
    answerPings(b)
    assert.equal((await hello(a)).kind, "welcome")
    assert.equal((await hello(b)).kind, "welcome")
    const status = await f.bridge.getStatus()
    assert.equal(status.sessions.length, 2)
    assert.equal(status.activeSessionId, null)
    assert.equal(status.sessions[0]?.capabilities.nodeRead, true)
    await assert.rejects(f.bridge.ping(), { code: "MULTIPLE_EDITOR_SESSIONS" })
    assert.deepEqual(await f.bridge.ping(status.sessions[0]?.sessionId), {
      alive: true,
    })
  } finally {
    await f.close()
  }
})

for (const [label, overrides, code] of [
  ["invalid credential", { token: "b".repeat(64) }, "AUTHENTICATION_FAILED"],
  [
    "incompatible version",
    { protocolVersion: 99 },
    "PROTOCOL_VERSION_MISMATCH",
  ],
  ["malformed handshake", { unexpected: true }, "INVALID_REQUEST"],
] as const) {
  test(`rejects ${label} without registering a session`, async () => {
    const f = await fixture()
    try {
      const message = await hello(await connect(f.url), overrides)
      assert.equal(message.kind, "rejected")
      if (message.kind === "rejected") assert.equal(message.error.code, code)
      assert.equal((await f.bridge.getStatus()).sessions.length, 0)
    } finally {
      await f.close()
    }
  })
}

test("rejects duplicate live editor identities", async () => {
  const f = await fixture()
  try {
    const sessionId = randomUUID()
    await hello(await connect(f.url), { sessionId })
    const reply = await hello(await connect(f.url), { sessionId })
    assert.equal(reply.kind, "rejected")
    if (reply.kind === "rejected")
      assert.equal(reply.error.code, "SESSION_ALREADY_CONNECTED")
  } finally {
    await f.close()
  }
})

test("rejects missing and unexpected origins before WebSocket upgrade", async () => {
  const f = await fixture()
  try {
    for (const badOrigin of [undefined, "https://attacker.example"]) {
      const socket = new WebSocket(f.url, { origin: badOrigin })
      await assert.rejects(once(socket, "open"), /403/)
    }
  } finally {
    await f.close()
  }
})

test("requires handshake before RPC and bounds the handshake deadline", async () => {
  const f = await fixture()
  try {
    const socket = await connect(f.url)
    const closed = once(socket, "close")
    await closed
    const second = await connect(f.url)
    const reply = once(second, "message")
    second.send(
      JSON.stringify({ kind: "request", id: "1", method: "ping", params: {} }),
    )
    const [data] = await reply
    const message = parseMessage(data.toString())
    assert.equal(message.kind, "rejected")
  } finally {
    await f.close()
  }
})

test("drops malformed, binary, and oversized messages", async () => {
  const f = await fixture()
  try {
    for (const payload of ["{broken", Buffer.from("{}")]) {
      const socket = await connect(f.url)
      const reply = once(socket, "message")
      socket.send(payload)
      const [data] = await reply
      const message = parseMessage(data.toString())
      assert.equal(message.kind, "rejected")
      if (message.kind === "rejected")
        assert.equal(message.error.code, "INVALID_REQUEST")
    }
    const socket = await connect(f.url)
    const closed = new Promise<number>((resolve) =>
      socket.once("close", resolve),
    )
    socket.send("x".repeat(MAX_PAYLOAD_BYTES + 1))
    assert.equal(await closed, 1009)
  } finally {
    await f.close()
  }
})

test("requests time out; unresponsive editors are not reported as connected", async () => {
  const f = await fixture()
  try {
    await hello(await connect(f.url))
    await assert.rejects(f.bridge.ping(), { code: "BRIDGE_TIMEOUT" })
    assert.equal((await f.bridge.getStatus()).connected, false)
  } finally {
    await f.close()
  }
})

test("disconnect removes the session and reconnect keeps its identity", async () => {
  const f = await fixture()
  try {
    const sessionId = randomUUID()
    const socket = await connect(f.url)
    await hello(socket, { sessionId })
    const closed = once(socket, "close")
    socket.close()
    await closed
    assert.equal((await f.bridge.getStatus()).sessions.length, 0)
    const next = await connect(f.url)
    answerPings(next)
    await hello(next, { sessionId })
    assert.equal((await f.bridge.getStatus()).activeSessionId, sessionId)
  } finally {
    await f.close()
  }
})

test("heartbeat removes a socket that stops responding to pong", async () => {
  const f = await fixture({ heartbeatIntervalMs: 20 })
  try {
    const socket = new WebSocket(f.url, { origin, autoPong: false })
    socket.on("error", () => {})
    await once(socket, "open")
    await hello(socket)
    await once(socket, "close")
    assert.equal((await f.bridge.getStatus()).sessions.length, 0)
  } finally {
    await f.close()
  }
})

test("RPC correlates responses, ignores late IDs and rejects pending requests on close", async () => {
  const sent: BridgeMessage[] = []
  const peer = new RpcPeer((message) => sent.push(message), 30)
  const first = peer.request()
  const second = peer.request()
  assert.equal(sent[0]?.kind, "request")
  assert.equal(sent[1]?.kind, "request")
  const firstId = sent[0]?.kind === "request" ? sent[0].id : ""
  const secondId = sent[1]?.kind === "request" ? sent[1].id : ""
  peer.receive({
    kind: "response",
    id: "late",
    ok: true,
    result: { alive: true },
  })
  peer.receive({
    kind: "response",
    id: secondId,
    ok: true,
    result: { alive: true },
  })
  assert.deepEqual(await second, { alive: true })
  const rejection = assert.rejects(first, { code: "SESSION_DISCONNECTED" })
  peer.close()
  await rejection
  await assert.rejects(peer.request(), { code: "SESSION_DISCONNECTED" })
  assert.notEqual(firstId, secondId)
  assert.throws(() => parseMessage("x".repeat(MAX_PAYLOAD_BYTES + 1)), {
    code: "PAYLOAD_TOO_LARGE",
  })
  assert.throws(
    () => parseMessage('{"kind":"event","event":"arbitrary","payload":{}}'),
    BridgeError,
  )
})

test("actual plugin client negotiates, answers probes, and cleans up on stop", async () => {
  const f = await fixture()
  const client = new BridgeClient({
    createSocket: () =>
      new WebSocket(f.url, { origin }) as unknown as BrowserSocket,
    heartbeatIntervalMs: 50,
    requestTimeoutMs: 50,
  })
  let state: ConnectionState = { phase: "waiting", message: "" }
  client.subscribe((next) => {
    state = next
  })
  try {
    client.start({ url: "wss://127.0.0.1:5174/bridge", token })
    await until(() => state.phase === "connected")
    assert.equal((await f.bridge.getStatus()).activeSessionId, client.sessionId)
    client.stop()
    assert.equal(state.phase, "waiting")
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal((await f.bridge.getStatus()).connected, false)
  } finally {
    client.stop()
    await f.close()
  }
})

test("actual plugin client automatically reconnects after a lost transport", async () => {
  const f = await fixture()
  const sockets: WebSocket[] = []
  let state: ConnectionState = { phase: "waiting", message: "" }
  const client = new BridgeClient({
    createSocket: () => {
      const socket = new WebSocket(f.url, { origin })
      sockets.push(socket)
      return socket as unknown as BrowserSocket
    },
    backoffMs: 10,
    maxBackoffMs: 20,
  })
  client.subscribe((next) => {
    state = next
  })
  try {
    client.start({ url: "wss://127.0.0.1:5174/bridge", token })
    await until(() => state.phase === "connected")
    sockets[0]?.terminate()
    await until(() => sockets.length >= 2 && state.phase === "connected")
    assert.equal((await f.bridge.getStatus()).activeSessionId, client.sessionId)
  } finally {
    client.stop()
    await f.close()
  }
})

test("MCP tools route typed design requests over a real transport and preserve domain errors", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js")
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js")
  const { InMemoryTransport } = await import(
    "@modelcontextprotocol/sdk/inMemory.js"
  )
  const { registerEditorTools } = await import("../src/tools/register.js")
  const { TEST_SESSION } = await import("../../plugin/test/fixtures/editor.js")
  const { projectFixture } = await import(
    "../../plugin/test/fixtures/project.js"
  )
  const f = await fixture({ requestTimeoutMs: 1000 })
  const editor = projectFixture()
  const plugin = new BridgeClient({
    sessionId: TEST_SESSION,
    capabilities: () => editor.adapter.capabilities(),
    handler: (method, params, context) =>
      editor.adapter.handle(method, params, context),
    createSocket: () =>
      new WebSocket(f.url, { origin }) as unknown as BrowserSocket,
  })
  const server = new McpServer({ name: "test-design-tools", version: "0.0.0" })
  registerEditorTools(server, f.bridge)
  const { registerDesignTools } = await import("../src/tools/design.js")
  const { ArtifactStore } = await import("../src/design/artifacts.js")
  const artifacts = await mkdtemp(join(tmpdir(), "fp-transport-"))
  registerDesignTools(server, f.bridge, new ArtifactStore(artifacts))
  const client = new Client({ name: "tools-check", version: "0.0.0" })
  const [a, b] = InMemoryTransport.createLinkedPair()
  let phase = "waiting"
  plugin.subscribe((state) => {
    phase = state.phase
  })
  try {
    await server.connect(a)
    await client.connect(b)
    const tools = await client.listTools()
    assert.equal(tools.tools.length, 32)
    assert.equal(
      tools.tools.find((tool) => tool.name === "update_node")?.annotations
        ?.readOnlyHint,
      false,
    )
    assert.equal(
      tools.tools.find((tool) => tool.name === "get_node")?.annotations
        ?.readOnlyHint,
      true,
    )
    const noEditor = await client.callTool({
      name: "get_project",
      arguments: {},
    })
    assert.equal(noEditor.isError, true)
    plugin.start({ url: "wss://127.0.0.1:5174/bridge", token })
    await until(() => phase === "connected")
    const project = await client.callTool({
      name: "get_project",
      arguments: {},
    })
    assert.equal(project.isError, undefined)
    const block = project.content as Array<{ text: string }>
    assert.equal(JSON.parse(block[0]?.text ?? "").name, "Fixture")
    const mutation = await client.callTool({
      name: "update_node",
      arguments: {
        node: { id: "hero", sessionId: TEST_SESSION },
        scope: "base",
        changes: { name: "MCP changed" },
      },
    })
    assert.equal(mutation.isError, undefined)
    assert.equal(editor.writes[0]?.id, "hero")
    async function readTool(name: string, args: Record<string, unknown> = {}) {
      const result = await client.callTool({ name, arguments: args })
      assert.equal(result.isError, undefined)
      return JSON.parse(
        (result.content as Array<{ text: string }>)[0]?.text ?? "",
      )
    }
    const capture = await readTool("capture_design", { maxNodes: 100 })
    assert.equal(capture.capture.atomic, false)
    const inspected = await readTool("inspect_design_artifact", {
      snapshotId: capture.snapshotId,
      limit: 2,
    })
    assert.equal(inspected.nodes.length, 2)
    const rejectedExport = await client.callTool({
      name: "generate_react",
      arguments: { snapshotId: capture.snapshotId },
    })
    assert.equal(rejectedExport.isError, true)
    const exported = await readTool("generate_react", {
      snapshotId: capture.snapshotId,
      options: { allowUnsupported: true },
    })
    assert.ok(exported.exportId)
    const comparison = await readTool("compare_design_artifacts", {
      before: capture.snapshotId,
      after: capture.snapshotId,
    })
    assert.equal(comparison.total, 0)
    const regenerated = await readTool("regenerate_react", {
      previousExportId: exported.exportId,
      snapshotId: capture.snapshotId,
      options: { allowUnsupported: true },
    })
    assert.equal(regenerated.status, "generated")
    assert.notEqual(regenerated.path, exported.path)
    const component = await readTool("get_component", {
      node: { id: "button", sessionId: TEST_SESSION },
    })
    await readTool("update_instance", {
      node: { id: "button", sessionId: TEST_SESSION },
      scope: "instance",
      controls: { label: "Transport" },
      expected: { revision: component.revision },
    })
    assert.equal(editor.projectWrites[0]?.kind, "controls")
    const collections = await readTool("get_collections")
    assert.equal(collections.items[0].id, "articles")
    const items = await readTool("get_collection_items", {
      collectionId: "articles",
    })
    await readTool("update_collection_item", {
      collectionId: "articles",
      itemId: "item",
      fields: { count: { type: "number", value: 3 } },
      expected: { revision: items.items[0].revision },
    })
    assert.equal(editor.records[0]?.fields.count.value, 3)
    assert.equal((await readTool("get_branch")).active.id, "main")
    const selected = await readTool("get_node", {
      node: { id: "title", sessionId: TEST_SESSION },
    })
    const plan = await readTool("plan_changes", {
      title: "Transport plan",
      operations: [
        {
          node: { id: "title", sessionId: TEST_SESSION },
          scope: "base",
          changes: { name: "Planned transport" },
          expected: { revision: selected.revision },
        },
      ],
    })
    const blocked = await client.callTool({
      name: "execute_change_plan",
      arguments: { planId: plan.id },
    })
    assert.equal(blocked.isError, true)
    editor.adapter.projectOperations.decide(plan.id, true)
    assert.equal(
      (await readTool("execute_change_plan", { planId: plan.id })).status,
      "completed",
    )
    const badSession = await client.callTool({
      name: "plan_changes",
      arguments: {
        sessionId: TEST_SESSION,
        title: "cross session",
        operations: [
          {
            node: {
              id: "title",
              sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            },
            scope: "base",
            changes: { name: "x" },
            expected: { revision: selected.revision },
          },
        ],
      },
    })
    assert.equal(badSession.isError, true)

    const refused = await client.callTool({
      name: "clear_breakpoint_override",
      arguments: {
        node: { id: "phone-hero" },
        breakpoint: { id: "phone" },
        property: "layout.gap",
      },
    })
    assert.equal(refused.isError, true)
    assert.equal(
      JSON.parse((refused.content as Array<{ text: string }>)[0]?.text ?? "")
        .error.code,
      "BREAKPOINT_WRITE_UNSUPPORTED",
    )
    await assert.rejects(
      f.bridge.request("get_node", {
        sessionId: TEST_SESSION,
        node: { id: "hero", sessionId: randomUUID() },
      }),
      { code: "INVALID_REQUEST" },
    )
  } finally {
    plugin.stop()
    await client.close()
    await server.close()
    await rm(artifacts, { recursive: true, force: true })
    await f.close()
  }
})
