import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PlanReview } from "../src/components/PlanReview"
import { TEST_SESSION } from "./fixtures/editor.js"
import { projectFixture } from "./fixtures/project.js"

test("review displays escaped exact changes, scope and approval actions with readable empty state", async () => {
  const f = projectFixture()
  const empty = renderToStaticMarkup(
    React.createElement(PlanReview, {
      operations: f.adapter.projectOperations,
    }),
  )
  assert.ok(empty.includes("Plans prepared by your agent"))
  const ref = { id: "hero", sessionId: TEST_SESSION }
  const snapshot = await f.adapter.handle(
    "get_node",
    { node: ref },
    { signal: new AbortController().signal, deadlineAt: Date.now() + 5000 },
  )
  assert.ok("revision" in snapshot)
  await f.adapter.handle(
    "plan_changes",
    {
      title: "Review <script>",
      operations: [
        {
          node: ref,
          scope: "base",
          changes: { name: "<img onerror=alert(1)>" },
          expected: { revision: snapshot.revision },
        },
      ],
    },
    { signal: new AbortController().signal, deadlineAt: Date.now() + 5000 },
  )
  const html = renderToStaticMarkup(
    React.createElement(PlanReview, {
      operations: f.adapter.projectOperations,
    }),
  )
  assert.ok(html.includes("Approve plan"))
  assert.ok(html.includes("Reject"))
  assert.ok(html.includes("hero"))
  assert.ok(html.includes("base"))
  assert.ok(html.includes("&lt;script&gt;"))
  assert.ok(!html.includes("<img"))
  assert.ok(html.includes("Some may apply before a failure"))
})
