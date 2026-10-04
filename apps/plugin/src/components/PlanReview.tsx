import { planTarget } from "@framer-plus/protocol"
import React from "react"
import type { ProjectOperations } from "../framer/project-operations"
export function PlanReview({ operations }: { operations: ProjectOperations }) {
  const [plans, setPlans] = React.useState(() => operations.review())
  const [error, setError] = React.useState("")
  React.useEffect(() => {
    const refresh = () => setPlans(operations.review())
    const unsubscribe = operations.subscribe(refresh)
    const timer = setInterval(refresh, 1000)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [operations])
  function decide(id: string, approve: boolean) {
    try {
      operations.decide(id, approve)
      setError("")
    } catch {
      setError(
        "This plan is no longer available. Ask the agent to prepare it again.",
      )
    }
  }
  return (
    <section className="plan-review" aria-label="Change plans">
      <h2>Change plans</h2>
      {!plans.length ? (
        <p className="hint" role="status">
          Plans prepared by your agent will appear here for review.
        </p>
      ) : (
        plans.map((plan) => (
          <article className="plan" key={plan.id}>
            <h3>{plan.title}</h3>
            <p className="hint" role="status">
              Status: {plan.status}
            </p>
            <p className="hint">
              {plan.operations.length} changes · expires{" "}
              {new Date(plan.expiresAt).toLocaleTimeString()}
            </p>
            <p className="hint">Branch: {plan.context.branchId ?? "unknown"}</p>
            <ol>
              {plan.operations.map((op, index) => (
                <li key={planTarget(op)}>
                  <strong>{plan.preview[index]?.name ?? planTarget(op)}</strong>{" "}
                  <span className="hint">
                    (
                    {op.scope === "cms"
                      ? `${op.collectionId}/${op.itemId}`
                      : op.node.id}
                    )
                  </span>{" "}
                  · {op.scope}
                  {"breakpoint" in op && op.breakpoint
                    ? ` (${op.breakpoint.id})`
                    : ""}
                  {plan.preview[index]?.page && (
                    <p className="hint">
                      Page: {plan.preview[index]?.page?.id}
                    </p>
                  )}
                  <details>
                    <summary>Current values</summary>
                    <pre>
                      {JSON.stringify(plan.preview[index]?.before, null, 2)}
                    </pre>
                  </details>
                  <p className="hint">Requested values</p>
                  <pre>
                    {JSON.stringify(
                      "changes" in op
                        ? op.changes
                        : op.scope === "instance"
                          ? op.controls
                          : op.scope === "cms"
                            ? op.fields
                            : op.scope === "style"
                              ? { kind: op.kind, styleId: op.styleId }
                              : null,
                      null,
                      2,
                    )}
                  </pre>
                </li>
              ))}
            </ol>
            <p className="hint">
              Changes run in sequence. Some may apply before a failure. Base
              changes can affect responsive copies.
            </p>
            {plan.status === "pending" && (
              <div className="actions">
                <button type="button" onClick={() => decide(plan.id, true)}>
                  Approve plan
                </button>
                <button type="button" onClick={() => decide(plan.id, false)}>
                  Reject
                </button>
              </div>
            )}
          </article>
        ))
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
