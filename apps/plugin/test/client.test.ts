import assert from "node:assert/strict"
import { test } from "node:test"
import {
  BRIDGE_CAPABILITIES,
  MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
} from "@framer-plus/protocol"
import {
  BridgeClient,
  type BrowserSocket,
  type ConnectionState,
} from "../src/bridge/client.js"

class FakeSocket {
  readyState = 0
  bufferedAmount = 0
  onopen: BrowserSocket["onopen"] = null
  onmessage: BrowserSocket["onmessage"] = null
  onclose: BrowserSocket["onclose"] = null
  onerror: BrowserSocket["onerror"] = null
  sent: string[] = []
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(String(data))
  }
  close() {
    this.readyState = 3
  }
  open() {
    this.readyState = 1
    this.onopen?.call(this as unknown as WebSocket, {} as Event)
  }
  message(data: string) {
    this.onmessage?.call(this as unknown as WebSocket, { data } as MessageEvent)
  }
  disconnect() {
    this.readyState = 3
    this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent)
  }
}
function fixture(options = {}) {
  const sockets: FakeSocket[] = []
  const states: ConnectionState[] = []
  const client = new BridgeClient({
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    backoffMs: 10,
    maxBackoffMs: 20,
    handshakeTimeoutMs: 30,
    heartbeatIntervalMs: 1_000,
    random: () => 0.5,
    ...options,
  })
  client.subscribe((state) => states.push(state))
  return {
    sockets,
    states,
    client,
    config: { url: "wss://127.0.0.1:5174/bridge", token: "a".repeat(64) },
  }
}
async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

test("plugin without MCP retries with capped backoff and cancels retries on stop", async () => {
  const f = fixture()
  try {
    f.client.start(f.config)
    f.sockets[0]?.disconnect()
    await wait(15)
    f.sockets[1]?.disconnect()
    assert.equal(f.states.at(-1)?.retryInMs, 20)
    f.client.stop()
    const count = f.sockets.length
    await wait(30)
    assert.equal(f.sockets.length, count)
    assert.equal(f.states.at(-1)?.phase, "waiting")
  } finally {
    f.client.stop()
  }
})

test("handshake timeout reconnects rather than hanging indefinitely", async () => {
  const f = fixture()
  try {
    f.client.start(f.config)
    await wait(35)
    assert.equal(f.states.at(-1)?.phase, "reconnecting")
  } finally {
    f.client.stop()
  }
})

test("invalid credential produces an actionable terminal error without retry", async () => {
  const f = fixture()
  try {
    f.client.start(f.config)
    f.sockets[0]?.open()
    f.sockets[0]?.message(
      JSON.stringify({
        kind: "rejected",
        error: {
          code: "AUTHENTICATION_FAILED",
          message: "Load current credential",
          retryable: false,
        },
      }),
    )
    assert.equal(f.states.at(-1)?.phase, "error")
    await wait(50)
    assert.equal(f.sockets.length, 1)
  } finally {
    f.client.stop()
  }
})

test("valid welcome enables ping replies and reconnect retains session identity", async () => {
  const f = fixture()
  try {
    f.client.start(f.config)
    const socket = f.sockets[0]
    assert.ok(socket)
    socket.open()
    socket.message(
      JSON.stringify({
        kind: "welcome",
        protocolVersion: PROTOCOL_VERSION,
        sessionId: f.client.sessionId,
        capabilities: BRIDGE_CAPABILITIES,
      }),
    )
    assert.equal(f.states.at(-1)?.phase, "connected")
    socket.message(
      JSON.stringify({ kind: "request", id: "r1", method: "ping", params: {} }),
    )
    await wait(0)
    assert.deepEqual(JSON.parse(socket.sent[1] ?? ""), {
      kind: "response",
      id: "r1",
      ok: true,
      result: { alive: true },
    })
    socket.disconnect()
    await wait(15)
    const next = f.sockets[1]
    assert.ok(next)
    next.open()
    assert.equal(JSON.parse(next.sent[0] ?? "").sessionId, f.client.sessionId)
  } finally {
    f.client.stop()
  }
})

test("malformed and oversized server messages stop the client", () => {
  for (const data of ["{broken", "x".repeat(MAX_PAYLOAD_BYTES + 1)]) {
    const f = fixture()
    try {
      f.client.start(f.config)
      f.sockets[0]?.open()
      f.sockets[0]?.message(data)
      assert.equal(f.states.at(-1)?.phase, "error")
    } finally {
      f.client.stop()
    }
  }
})

test("rejects non-loopback and insecure pairing addresses before making a connection", () => {
  for (const url of [
    "ws://127.0.0.1:5174/bridge",
    "wss://example.com/bridge",
    "wss://127.0.0.1:5174/bridge?token=secret",
  ]) {
    const f = fixture()
    try {
      f.client.start({ ...f.config, url })
      assert.equal(f.sockets.length, 0)
      assert.equal(f.states.at(-1)?.phase, "error")
    } finally {
      f.client.stop()
    }
  }
})
