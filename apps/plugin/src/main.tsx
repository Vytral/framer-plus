import { framer } from "@framer/plugin"
import { connectionConfigSchema } from "@framer-plus/protocol"
import React from "react"
import { createRoot } from "react-dom/client"
import { BridgeClient, type ConnectionState } from "./bridge/client"
import { PlanReview } from "./components/PlanReview"
import { EditorAdapter } from "./framer/adapter"
import { createEditorApi } from "./framer/api"
import { createProjectApi } from "./framer/project-api"
import "./styles.css"

framer.showUI({ position: "top right", width: 400, height: 640 })

function App() {
  const [selectionCount, setSelectionCount] = React.useState(0)
  const [adapter] = React.useState(() => {
    const api = createEditorApi(framer)
    api.project = createProjectApi(framer)
    return new EditorAdapter(api, globalThis.crypto.randomUUID())
  })
  const [client] = React.useState(() => {
    const sessionId = adapter.sessionId
    return new BridgeClient({
      sessionId,
      capabilities: () => adapter.capabilities(),
      handler: (method, params, context) =>
        adapter.handle(method, params, context),
    })
  })
  const [state, setState] = React.useState<ConnectionState>({
    phase: "waiting",
    message: "Pair with the local MCP process.",
  })
  const [credential, setCredential] = React.useState("")
  const [formError, setFormError] = React.useState("")

  React.useEffect(
    () =>
      framer.subscribeToSelection((selection) =>
        setSelectionCount(selection.length),
      ),
    [],
  )
  React.useEffect(() => {
    const unsubscribe = client.subscribe((next) => {
      setState(next)
      if (next.phase !== "connected") adapter.projectOperations.revoke()
    })
    return () => {
      unsubscribe()
      client.stop()
    }
  }, [client, adapter])

  function connect(event: React.FormEvent) {
    event.preventDefault()
    try {
      const config = connectionConfigSchema.parse(JSON.parse(credential))
      setFormError("")
      setCredential("")
      client.start(config)
    } catch {
      setFormError(
        "Paste the complete connection JSON from the running MCP process.",
      )
    }
  }
  const title = {
    waiting: "Waiting for MCP",
    connecting: "Connecting…",
    connected: "Connected",
    reconnecting: "Reconnecting…",
    error: "Connection error",
  }[state.phase]
  return (
    <main>
      <p className="eyebrow">Framer+</p>
      <h1>{title}</h1>
      <p className="body" role="status" aria-live="polite">
        {state.message}
      </p>
      {state.sessionId && (
        <p className="session">Session: {state.sessionId.slice(0, 8)}</p>
      )}
      <form onSubmit={connect}>
        <label htmlFor="credential">MCP connection JSON</label>
        <input
          id="credential"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste local connection file contents"
          value={credential}
          onChange={(event) => setCredential(event.target.value)}
        />
        <p className="hint">
          Start MCP, then copy the contents of the connection file shown in its
          terminal. Credentials stay in memory.
        </p>
        {formError && (
          <p className="error" role="alert">
            {formError}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={!credential.trim()}>
            Connect
          </button>
          {state.phase !== "waiting" && (
            <button type="button" onClick={() => client.stop()}>
              Disconnect
            </button>
          )}
        </div>
      </form>
      <PlanReview operations={adapter.projectOperations} />
      <div className="status">
        <span>Current selection</span>
        <strong>{selectionCount}</strong>
      </div>
    </main>
  )
}

const root = document.getElementById("root")
if (!root) throw new Error("Plugin root element is missing")
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
