import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { useEffect, useMemo, useState } from "react"
import { getServerHealth, type ServerHealth } from "@/lib/rpcClient"

type RpcState =
  | { tag: "loading" }
  | { tag: "success"; data: ServerHealth }
  | { tag: "error"; message: string }

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const [state, setState] = useState<RpcState>({ tag: "loading" })

  useEffect(() => {
    let active = true

    Effect.runPromise(getServerHealth)
      .then((data) => {
        if (!active) return
        setState({ tag: "success", data })
      })
      .catch((error) => {
        if (!active) return
        const message = error instanceof Error ? error.message : String(error)
        setState({ tag: "error", message })
      })

    return () => {
      active = false
    }
  }, [])

  const content = useMemo(() => {
    if (state.tag === "loading") {
      return <p>Calling Effect RPC server...</p>
    }

    if (state.tag === "error") {
      return <p>RPC call failed: {state.message}</p>
    }

    return (
      <div className="status-grid">
        <div className="status-row">
          <strong>Status</strong>
          <span>{state.data.status}</span>
        </div>
        <div className="status-row">
          <strong>Database</strong>
          <span>{state.data.dbStatus}</span>
        </div>
        <div className="status-row">
          <strong>Timestamp</strong>
          <span>{new Date(state.data.timestamp).toLocaleString()}</span>
        </div>
        <div className="status-row">
          <strong>RPC Path</strong>
          <span>{import.meta.env.VITE_RPC_URL ?? "/rpc"}</span>
        </div>
      </div>
    )
  }, [state])

  return (
    <main className="card">
      <h1>Radix Vaults Tracer Bullet</h1>
      <p>
        TanStack Start client is live and calling the Node.js Effect RPC server.
      </p>
      <h2>Server Health</h2>
      {content}
    </main>
  )
}
