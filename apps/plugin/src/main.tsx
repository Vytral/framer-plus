import React from "react"
import { createRoot } from "react-dom/client"
import { framer } from "framer"
import "./styles.css"

function App() {
  const [selectionCount, setSelectionCount] = React.useState(0)

  React.useEffect(() => {
    let active = true

    async function refreshSelection() {
      const selection = await framer.getSelection()
      if (active) setSelectionCount(selection.length)
    }

    void refreshSelection()

    const unsubscribe = framer.subscribeToSelection(() => {
      void refreshSelection()
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return (
    <main>
      <p className="eyebrow">Framer+</p>
      <h1>Agent bridge connected.</h1>
      <p className="body">
        The plugin shell is running. MCP transport and project inspection come next.
      </p>
      <div className="status">
        <span>Current selection</span>
        <strong>{selectionCount}</strong>
      </div>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
