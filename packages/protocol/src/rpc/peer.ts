import {
  BridgeError,
  MAX_PAYLOAD_BYTES,
  REQUEST_TIMEOUT_MS,
  type RpcMessage,
} from "../messages.js"
import {
  inputSchemas,
  type Method,
  type MethodInput,
  type MethodResult,
  resultSchemas,
  WRITE_METHODS,
} from "../schemas/commands.js"
import type { RpcResult } from "../schemas/design.js"

export type RequestContext = { signal: AbortSignal; deadlineAt: number }
export type RequestHandler = (
  method: Method,
  params: unknown,
  context: RequestContext,
) => Promise<RpcResult> | RpcResult
type Pending = {
  method: Method
  resolve: (result: RpcResult) => void
  reject: (error: BridgeError) => void
  timer: ReturnType<typeof setTimeout>
}

/** Correlates typed, bounded RPCs and preserves uncertainty after a mutation timeout. */
export class RpcPeer {
  private readonly pending = new Map<string, Pending>()
  private readonly inbound = new Map<string, AbortController>()
  private closed = false
  constructor(
    private readonly send: (message: RpcMessage) => void,
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
    private readonly handler: RequestHandler = (method) => {
      if (method !== "ping")
        throw new BridgeError(
          "CAPABILITY_UNAVAILABLE",
          "This peer only handles connectivity probes",
          false,
        )
      return { alive: true }
    },
  ) {}

  request(): Promise<MethodResult<"ping">>
  request<M extends Method>(
    method: M,
    params: MethodInput<M>,
  ): Promise<MethodResult<M>>
  request(method: Method = "ping", params: unknown = {}): Promise<RpcResult> {
    if (this.closed)
      return Promise.reject(
        new BridgeError("SESSION_DISCONNECTED", "Session disconnected", true),
      )
    if (this.pending.size >= 64)
      return Promise.reject(
        new BridgeError("INVALID_REQUEST", "Too many pending requests", true),
      )
    const parsed = inputSchemas[method].safeParse(params)
    if (!parsed.success)
      return Promise.reject(
        new BridgeError("INVALID_REQUEST", "Invalid method parameters", false),
      )
    const id = globalThis.crypto.randomUUID()
    const timeout =
      method === "ping" ? Math.min(this.timeoutMs, 5_000) : this.timeoutMs
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new BridgeError(
            "BRIDGE_TIMEOUT",
            WRITE_METHODS.has(method)
              ? "Mutation timed out and may have applied. Inspect the node before attempting another write."
              : "Editor request timed out",
            !WRITE_METHODS.has(method),
          ),
        )
      }, timeout)
      this.pending.set(id, { method, resolve, reject, timer })
      try {
        this.send({
          kind: "request",
          id,
          method,
          params: parsed.data,
          deadlineAt: Date.now() + timeout,
        })
      } catch {
        this.finish(
          id,
          new BridgeError(
            "SESSION_DISCONNECTED",
            WRITE_METHODS.has(method)
              ? "Connection lost; inspect the node before retrying a mutation"
              : "Unable to send bridge request",
            !WRITE_METHODS.has(method),
          ),
        )
      }
    })
  }

  receive(message: RpcMessage): void {
    if (this.closed) return
    if (message.kind === "request") {
      void this.handle(message)
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    if (!message.ok) {
      pending.reject(
        new BridgeError(
          message.error.code,
          message.error.message,
          message.error.retryable,
        ),
      )
      return
    }
    const parsed = resultSchemas[pending.method].safeParse(message.result)
    if (parsed.success) pending.resolve(parsed.data)
    else
      pending.reject(
        new BridgeError(
          "INVALID_REQUEST",
          "Editor returned an invalid result for this method",
          false,
        ),
      )
  }

  private async handle(
    message: Extract<RpcMessage, { kind: "request" }>,
  ): Promise<void> {
    if (this.inbound.has(message.id) || this.inbound.size >= 16) {
      this.safeSend({
        kind: "response",
        id: message.id,
        ok: false,
        error: new BridgeError(
          "INVALID_REQUEST",
          "Duplicate or excessive concurrent requests",
          false,
        ).toJSON(),
      })
      return
    }
    const controller = new AbortController()
    this.inbound.set(message.id, controller)
    try {
      const deadlineAt = Math.min(
        message.deadlineAt ?? Date.now() + this.timeoutMs,
        Date.now() + this.timeoutMs,
      )
      if (Date.now() >= deadlineAt)
        throw new BridgeError(
          "BRIDGE_TIMEOUT",
          "Request deadline expired before execution",
          false,
        )
      const params = inputSchemas[message.method].parse(message.params)
      const result = await this.handler(message.method, params, {
        signal: controller.signal,
        deadlineAt,
      })
      const parsed = resultSchemas[message.method].safeParse(result)
      if (!parsed.success)
        throw new BridgeError(
          "INTERNAL_ERROR",
          "Adapter returned an invalid result",
          false,
        )
      const response = {
        kind: "response" as const,
        id: message.id,
        ok: true as const,
        result: parsed.data,
      }
      if (
        new TextEncoder().encode(JSON.stringify(response)).byteLength >
        MAX_PAYLOAD_BYTES
      )
        throw new BridgeError(
          "PAYLOAD_TOO_LARGE",
          "Result exceeds the transport limit; inspect a smaller subtree",
          false,
        )
      this.safeSend(response)
    } catch (error) {
      const failure =
        error instanceof BridgeError
          ? error
          : new BridgeError(
              "FRAMER_API_ERROR",
              "Framer operation failed",
              false,
            )
      this.safeSend({
        kind: "response",
        id: message.id,
        ok: false,
        error: failure.toJSON(),
      })
    } finally {
      this.inbound.delete(message.id)
    }
  }
  private safeSend(message: RpcMessage): void {
    if (this.closed) return
    try {
      this.send(message)
    } catch {
      this.close()
    }
  }
  private finish(id: string, error: BridgeError): void {
    const pending = this.pending.get(id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(id)
    pending.reject(error)
  }
  close(): void {
    this.closed = true
    for (const controller of this.inbound.values()) controller.abort()
    this.inbound.clear()
    for (const [id, pending] of this.pending)
      this.finish(
        id,
        new BridgeError(
          "SESSION_DISCONNECTED",
          WRITE_METHODS.has(pending.method)
            ? "Session disconnected; a pending mutation may have applied. Inspect before retrying."
            : "Session disconnected",
          !WRITE_METHODS.has(pending.method),
        ),
      )
  }
}
