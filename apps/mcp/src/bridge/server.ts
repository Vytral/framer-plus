import { timingSafeEqual } from "node:crypto"
import type { IncomingMessage, Server } from "node:http"
import type { Duplex } from "node:stream"
import {
  BRIDGE_CAPABILITIES,
  BridgeError,
  type BridgeMessage,
  HANDSHAKE_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  inputSchemas,
  MAX_PAYLOAD_BYTES,
  type Method,
  type MethodInput,
  type MethodResult,
  PROTOCOL_VERSION,
  parseMessage,
  RpcPeer,
} from "@framer-plus/protocol"
import { WebSocket, WebSocketServer } from "ws"

type Session = {
  sessionId: string
  connectedAt: string
  lastSeenAt: string
  pluginVersion: string
  protocolVersion: number
  capabilities: typeof BRIDGE_CAPABILITIES
}
type Connection = {
  socket: WebSocket
  peer: RpcPeer
  session: Session
  alive: boolean
}
export type BridgeOptions = {
  token: string
  allowedOrigins: string[]
  handshakeTimeoutMs?: number
  heartbeatIntervalMs?: number
  requestTimeoutMs?: number
  onEvent?: (event: {
    event: string
    sessionId?: string
    code?: string
  }) => void
}

/** Authenticated session registry attached to a loopback HTTP(S) listener. */
export class EditorBridge {
  private readonly sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  })
  private readonly sessions = new Map<string, Connection>()
  private readonly heartbeat: ReturnType<typeof setInterval>
  private closing = false

  constructor(
    private readonly server: Server,
    private readonly options: BridgeOptions,
  ) {
    server.on("upgrade", this.upgrade)
    this.sockets.on("connection", (socket) => this.accept(socket))
    this.heartbeat = setInterval(() => {
      for (const connection of this.sessions.values()) {
        if (!connection.alive) {
          connection.socket.terminate()
          continue
        }
        connection.alive = false
        connection.socket.ping()
      }
    }, options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS)
    this.heartbeat.unref()
  }

  private readonly upgrade: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void = (request, socket, head) => {
    const remote = request.socket.remoteAddress
    const allowed =
      !this.closing &&
      request.url === "/bridge" &&
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote ?? "") &&
      this.options.allowedOrigins.includes(request.headers.origin ?? "") &&
      this.sockets.clients.size < 32
    if (!allowed) {
      socket.end(
        "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      )
      return
    }
    this.sockets.handleUpgrade(request, socket, head, (ws) =>
      this.sockets.emit("connection", ws, request),
    )
  }

  private accept(socket: WebSocket): void {
    let connection: Connection | undefined
    const handshake = setTimeout(
      () => socket.terminate(),
      this.options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS,
    )
    handshake.unref()
    const send = (message: BridgeMessage) => {
      if (socket.readyState !== WebSocket.OPEN)
        throw new BridgeError(
          "SESSION_DISCONNECTED",
          "Session disconnected",
          true,
        )
      socket.send(JSON.stringify(message))
    }
    const reject = (error: BridgeError) => {
      this.options.onEvent?.({ event: "connection_rejected", code: error.code })
      if (connection) {
        connection.peer.close()
        this.sessions.delete(connection.session.sessionId)
        connection = undefined
      }
      if (socket.readyState === WebSocket.OPEN) {
        send({ kind: "rejected", error: error.toJSON() })
        socket.close(1008, error.code)
      }
      clearTimeout(handshake)
      // Uncooperative clients must not retain a closing socket indefinitely.
      const deadline = setTimeout(() => socket.terminate(), 1_000)
      deadline.unref()
      socket.once("close", () => clearTimeout(deadline))
    }
    socket.on("message", (data, binary) => {
      if (socket.readyState !== WebSocket.OPEN) return
      try {
        if (binary)
          throw new BridgeError(
            "INVALID_REQUEST",
            "Binary messages are not supported",
            false,
          )
        const message = parseMessage(data.toString())
        if (!connection) {
          if (message.kind !== "hello")
            throw new BridgeError(
              "INVALID_REQUEST",
              "A hello handshake is required",
              false,
            )
          const supplied = Buffer.from(message.token)
          const expected = Buffer.from(this.options.token)
          if (
            supplied.length !== expected.length ||
            !timingSafeEqual(supplied, expected)
          ) {
            throw new BridgeError(
              "AUTHENTICATION_FAILED",
              "Connection credential is invalid; load the current connection file",
              false,
            )
          }
          if (message.protocolVersion !== PROTOCOL_VERSION) {
            throw new BridgeError(
              "PROTOCOL_VERSION_MISMATCH",
              "Plugin and MCP protocol versions are incompatible",
              false,
            )
          }
          if (this.sessions.has(message.sessionId)) {
            throw new BridgeError(
              "SESSION_ALREADY_CONNECTED",
              "This editor session is already connected",
              false,
            )
          }
          const negotiated = Object.fromEntries(
            Object.entries(BRIDGE_CAPABILITIES).map(([key, supported]) => [
              key,
              supported &&
                message.capabilities[key as keyof typeof BRIDGE_CAPABILITIES],
            ]),
          ) as typeof BRIDGE_CAPABILITIES
          const now = new Date().toISOString()
          connection = {
            socket,
            peer: new RpcPeer(send, this.options.requestTimeoutMs),
            alive: true,
            session: {
              sessionId: message.sessionId,
              connectedAt: now,
              lastSeenAt: now,
              pluginVersion: message.clientVersion,
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { ...negotiated },
            },
          }
          this.sessions.set(message.sessionId, connection)
          this.options.onEvent?.({
            event: "session_connected",
            sessionId: message.sessionId,
          })
          clearTimeout(handshake)
          send({
            kind: "welcome",
            protocolVersion: PROTOCOL_VERSION,
            sessionId: message.sessionId,
            capabilities: { ...negotiated },
          })
        } else if (message.kind === "request" || message.kind === "response") {
          connection.session.lastSeenAt = new Date().toISOString()
          connection.peer.receive(message)
        } else {
          throw new BridgeError(
            "INVALID_REQUEST",
            "Unexpected message for an established session",
            false,
          )
        }
      } catch (error) {
        reject(
          error instanceof BridgeError
            ? error
            : new BridgeError("INTERNAL_ERROR", "Bridge message failed", false),
        )
      }
    })
    socket.on("pong", () => {
      if (!connection) return
      connection.alive = true
      connection.session.lastSeenAt = new Date().toISOString()
    })
    socket.on("error", () => socket.terminate())
    socket.on("close", () => {
      clearTimeout(handshake)
      if (!connection) return
      connection.peer.close()
      this.options.onEvent?.({
        event: "session_disconnected",
        sessionId: connection.session.sessionId,
      })
      if (this.sessions.get(connection.session.sessionId) === connection)
        this.sessions.delete(connection.session.sessionId)
    })
  }

  async ping(sessionId?: string): Promise<{ alive: true }> {
    if (!sessionId && this.sessions.size > 1)
      throw new BridgeError(
        "MULTIPLE_EDITOR_SESSIONS",
        "Choose an explicit sessionId",
        false,
      )
    const connection = sessionId
      ? this.sessions.get(sessionId)
      : this.sessions.values().next().value
    if (!connection)
      throw new BridgeError(
        "NO_EDITOR_SESSION",
        "No live Framer editor session is connected",
        true,
      )
    return connection.peer.request()
  }

  async request<M extends Method>(
    method: M,
    raw: MethodInput<M>,
  ): Promise<MethodResult<M>> {
    const parsed = inputSchemas[method].safeParse(raw)
    if (!parsed.success)
      throw new BridgeError("INVALID_REQUEST", "Invalid tool parameters", false)
    const params = parsed.data
    const scopes = new Set<string>()
    if ("sessionId" in params && typeof params.sessionId === "string")
      scopes.add(params.sessionId)
    for (const key of [
      "node",
      "root",
      "page",
      "breakpoint",
      "expectedCanvas",
    ] as const) {
      if (key in params) {
        const reference = (params as Record<string, unknown>)[key] as
          | { sessionId?: string }
          | undefined
        if (reference?.sessionId) scopes.add(reference.sessionId)
      }
    }
    if ("operations" in params && Array.isArray(params.operations)) {
      for (const op of params.operations)
        for (const r of [op.node, op.breakpoint])
          if (r?.sessionId) scopes.add(r.sessionId)
    }
    if (scopes.size > 1)
      throw new BridgeError(
        "INVALID_REQUEST",
        "All references must belong to the same editor session",
        false,
      )
    const sessionId = scopes.values().next().value
    if (!sessionId && this.sessions.size > 1)
      throw new BridgeError(
        "MULTIPLE_EDITOR_SESSIONS",
        "Specify a sessionId; multiple editors are connected",
        false,
      )
    const connection = sessionId
      ? this.sessions.get(sessionId)
      : this.sessions.values().next().value
    if (!connection)
      throw new BridgeError(
        "NO_EDITOR_SESSION",
        "No matching live Framer editor session is connected",
        true,
      )
    const capabilityMap: Partial<
      Record<Method, keyof typeof BRIDGE_CAPABILITIES>
    > = {
      get_project: "projectRead",
      get_selection: "selectionRead",
      get_node_tree: "nodeTreeRead",
      update_node: "nodeWrite",
      set_breakpoint_override: "responsiveWrite",
      get_breakpoints: "responsiveRead",
      get_responsive_state: "responsiveRead",
      clear_breakpoint_override: "responsiveRead",
      get_components: "componentRead",
      get_component: "componentRead",
      update_instance: "componentWrite",
      clear_instance_override: "componentRead",
      get_collections: "cmsRead",
      get_collection_schema: "cmsRead",
      get_collection_items: "cmsRead",
      update_collection_item: "cmsWrite",
      get_branch: "branchSupport",
      apply_style: "nodeWrite",
      execute_change_plan: "nodeWrite",
    }
    const capability = capabilityMap[method] ?? "nodeRead"
    if (method !== "ping" && !connection.session.capabilities[capability])
      throw new BridgeError(
        "CAPABILITY_UNAVAILABLE",
        "The selected editor does not support this operation",
        false,
      )
    return connection.peer.request(method, raw)
  }

  /** Probes each editor before reporting it as live, rather than trusting an open socket. */
  async getStatus() {
    const live = await Promise.all(
      [...this.sessions.values()].map(async (connection) => {
        try {
          await connection.peer.request()
          if (this.sessions.get(connection.session.sessionId) !== connection)
            return undefined
          connection.session.lastSeenAt = new Date().toISOString()
          return {
            ...connection.session,
            capabilities: { ...connection.session.capabilities },
          }
        } catch {
          connection.socket.terminate()
          return undefined
        }
      }),
    )
    const sessions = live.filter((session) => session !== undefined)
    return {
      connected: sessions.length > 0,
      bridge: "listening" as const,
      protocolVersion: PROTOCOL_VERSION,
      sessions,
      activeSessionId: sessions.length === 1 ? sessions[0]?.sessionId : null,
    }
  }

  async close(): Promise<void> {
    this.closing = true
    clearInterval(this.heartbeat)
    this.server.off("upgrade", this.upgrade)
    for (const connection of this.sessions.values()) {
      connection.peer.close()
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(
          JSON.stringify({
            kind: "event",
            event: "session.closing",
            payload: { reason: "server_shutdown" },
          }),
        )
      }
    }
    for (const socket of this.sockets.clients) socket.terminate()
    this.sessions.clear()
    await new Promise<void>((resolve) => this.sockets.close(() => resolve()))
  }
}
