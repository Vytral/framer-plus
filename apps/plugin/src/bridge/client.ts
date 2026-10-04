import {
  BRIDGE_CAPABILITIES,
  BridgeError,
  type BridgeMessage,
  type Capabilities,
  type ConnectionConfig,
  connectionConfigSchema,
  HANDSHAKE_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  MAX_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  parseMessage,
  type RequestHandler,
  RpcPeer,
} from "@framer-plus/protocol"

export type ConnectionState = {
  phase: "waiting" | "connecting" | "connected" | "reconnecting" | "error"
  message: string
  sessionId?: string
  retryInMs?: number
}
/** Minimal browser socket boundary, also usable by transport integration tests. */
export type BrowserSocket = Pick<
  WebSocket,
  | "readyState"
  | "bufferedAmount"
  | "send"
  | "close"
  | "onopen"
  | "onmessage"
  | "onerror"
  | "onclose"
>
export type ClientOptions = {
  sessionId?: string
  capabilities?: () => Capabilities
  handler?: RequestHandler
  createSocket?: (url: string) => BrowserSocket
  handshakeTimeoutMs?: number
  heartbeatIntervalMs?: number
  requestTimeoutMs?: number
  backoffMs?: number
  maxBackoffMs?: number
  random?: () => number
}

/** One editor identity survives reconnects; credentials remain only in memory. */
export class BridgeClient {
  readonly sessionId: string
  private socket?: BrowserSocket
  private peer?: RpcPeer
  private config?: ConnectionConfig
  private attempt = 0
  private readonly listeners = new Set<(state: ConnectionState) => void>()
  private state: ConnectionState = {
    phase: "waiting",
    message: "Pair with the local MCP process.",
  }
  private deadline?: ReturnType<typeof setTimeout>
  private retry?: ReturnType<typeof setTimeout>
  private heartbeat?: ReturnType<typeof setInterval>
  private probing = false

  constructor(private readonly options: ClientOptions = {}) {
    this.sessionId = options.sessionId ?? globalThis.crypto.randomUUID()
  }

  subscribe(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(state: ConnectionState): void {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }

  start(config: ConnectionConfig): void {
    this.stop()
    const parsed = connectionConfigSchema.safeParse(config)
    if (!parsed.success) {
      this.update({
        phase: "error",
        message: "Use the connection JSON from the running MCP process.",
      })
      return
    }
    this.config = parsed.data
    this.attempt = 0
    this.connect()
  }

  private connect(): void {
    const config = this.config
    if (!config) return
    this.update({ phase: "connecting", message: "Connecting to local MCP…" })
    let socket: BrowserSocket
    try {
      socket = (this.options.createSocket ?? ((url) => new WebSocket(url)))(
        config.url,
      )
    } catch {
      this.scheduleRetry()
      return
    }
    this.socket = socket
    let welcomed = false
    const send = (message: BridgeMessage) => {
      if (this.socket !== socket || socket.readyState !== 1)
        throw new BridgeError(
          "SESSION_DISCONNECTED",
          "Bridge disconnected",
          true,
        )
      if (socket.bufferedAmount > MAX_PAYLOAD_BYTES)
        throw new BridgeError(
          "PAYLOAD_TOO_LARGE",
          "Bridge output buffer is full",
          true,
        )
      socket.send(JSON.stringify(message))
    }
    this.deadline = setTimeout(
      () => this.failed(socket),
      this.options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS,
    )
    socket.onopen = () => {
      if (this.socket !== socket) return
      try {
        send({
          kind: "hello",
          protocolVersion: PROTOCOL_VERSION,
          client: "framer-plugin",
          clientVersion: "0.0.0",
          sessionId: this.sessionId,
          token: config.token,
          capabilities:
            this.options.capabilities?.() ??
            (Object.fromEntries(
              Object.keys(BRIDGE_CAPABILITIES).map((key) => [key, false]),
            ) as Capabilities),
        })
      } catch {
        this.failed(socket)
      }
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      try {
        if (typeof event.data !== "string")
          throw new BridgeError(
            "INVALID_REQUEST",
            "Binary messages are not supported",
            false,
          )
        const message = parseMessage(event.data)
        if (message.kind === "rejected") {
          this.releaseSocket()
          if (message.error.retryable) this.scheduleRetry()
          else {
            this.config = undefined
            this.update({ phase: "error", message: message.error.message })
          }
          return
        }
        if (!welcomed) {
          if (
            message.kind !== "welcome" ||
            message.sessionId !== this.sessionId
          )
            throw new BridgeError(
              "INVALID_REQUEST",
              "Invalid bridge handshake",
              false,
            )
          welcomed = true
          clearTimeout(this.deadline)
          this.peer = new RpcPeer(
            send,
            this.options.requestTimeoutMs,
            this.options.handler,
          )
          this.attempt = 0
          this.update({
            phase: "connected",
            message: "Local MCP connected.",
            sessionId: this.sessionId,
          })
          this.heartbeat = setInterval(() => {
            if (this.probing) return
            this.probing = true
            void this.peer
              ?.request()
              .catch(() => this.failed(socket))
              .finally(() => {
                this.probing = false
              })
          }, this.options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS)
        } else if (message.kind === "request" || message.kind === "response") {
          this.peer?.receive(message)
        } else if (message.kind === "event") {
          this.failed(socket)
        } else
          throw new BridgeError(
            "INVALID_REQUEST",
            "Unexpected bridge message",
            false,
          )
      } catch {
        this.releaseSocket()
        this.config = undefined
        this.update({
          phase: "error",
          message:
            "Invalid bridge response. Update the plugin and MCP together.",
        })
      }
    }
    socket.onerror = () => this.failed(socket)
    socket.onclose = () => this.failed(socket)
  }

  private failed(socket: BrowserSocket): void {
    if (this.socket !== socket) return
    this.releaseSocket()
    this.scheduleRetry()
  }
  private scheduleRetry(): void {
    if (!this.config) return
    const maximum = this.options.maxBackoffMs ?? 10_000
    const base = Math.min(
      maximum,
      (this.options.backoffMs ?? 500) * 2 ** Math.min(this.attempt++, 10),
    )
    const delay = Math.min(
      maximum,
      Math.round(base * (0.8 + (this.options.random ?? Math.random)() * 0.4)),
    )
    this.update({
      phase: "reconnecting",
      message:
        "MCP unavailable. Retrying; check that it is running and its TLS certificate is trusted.",
      retryInMs: delay,
    })
    this.retry = setTimeout(() => this.connect(), delay)
  }

  private releaseSocket(): void {
    clearTimeout(this.deadline)
    clearInterval(this.heartbeat)
    const socket = this.socket
    this.socket = undefined
    this.peer?.close()
    this.peer = undefined
    this.probing = false
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      try {
        socket.close()
      } catch {
        /* A failed constructor/transport may already be closed. */
      }
    }
  }
  stop(): void {
    this.config = undefined
    clearTimeout(this.retry)
    this.releaseSocket()
    this.update({
      phase: "waiting",
      message: "Pair with the local MCP process.",
    })
  }
}
