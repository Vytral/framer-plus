import assert from "node:assert/strict"
import { test } from "node:test"
import {
  inputSchemas,
  type Method,
  type MethodInput,
  type MethodResult,
  nodeSchema,
  RpcPeer,
  resultSchemas,
} from "@framer-plus/protocol"
import { dimension } from "../src/framer/api.js"
import { editorFixture, TEST_SESSION } from "./fixtures/editor.js"

const context = () => ({
  signal: new AbortController().signal,
  deadlineAt: Date.now() + 5_000,
})
const target = (id: string) => ({ id, sessionId: TEST_SESSION })
async function call<M extends Method>(
  f: ReturnType<typeof editorFixture>,
  method: M,
  params: MethodInput<M>,
) {
  return resultSchemas[method].parse(
    await f.adapter.handle(method, params, context()),
  ) as MethodResult<M>
}

test("normalization preserves sizing semantics and unknown nodes, with stable scoped references", async () => {
  const f = editorFixture()
  const result = nodeSchema.parse(
    await call(f, "get_node", { node: target("hero") }),
  )
  assert.equal(result.type, "stack")
  assert.equal(result.layout?.width?.mode, "fill")
  assert.equal(result.layout?.width?.value, 1)
  assert.equal(result.layout?.height?.mode, "fit-content")
  assert.equal(result.parent?.id, "desktop")
  assert.deepEqual(result.ref, target("hero"))
  const unknown = nodeSchema.parse(
    await call(f, "get_node", { node: target("future") }),
  )
  assert.equal(unknown.type, "unknown")
  assert.equal(unknown.capabilities.treeRead, false)
  assert.deepEqual(unknown.capabilities.writableProperties, [])
  assert.equal(dimension("50%").mode, "percentage")
  assert.equal(dimension("100vh").mode, "viewport")
  assert.equal(dimension("mystery").raw, "mystery")
})

test("project, selection, breakpoints and responsive inspection expose only supported semantics", async () => {
  const f = editorFixture()
  const project = await call(f, "get_project", {})
  assert.ok("canvasRoot" in project)
  assert.equal(project.canvasRoot.id, "page")
  const selection = await call(f, "get_selection", {})
  assert.ok("nodes" in selection)
  assert.equal(selection.nodes[0]?.ref.id, "title")
  const breakpoints = await call(f, "get_breakpoints", {})
  assert.ok("breakpoints" in breakpoints)
  assert.deepEqual(
    breakpoints.breakpoints.map((item) => [item.ref.id, item.primary]),
    [
      ["desktop", true],
      ["tablet", false],
      ["phone", false],
    ],
  )
  const responsive = await call(f, "get_responsive_state", {
    node: target("phone-hero"),
    properties: ["layout.gap", "text.fontSize"],
  })
  assert.ok("properties" in responsive)
  assert.equal(responsive.properties["layout.gap"]?.effective, "20px")
  assert.equal(responsive.properties["layout.gap"]?.source.kind, "unknown")
  assert.equal(responsive.properties["layout.gap"]?.overrideStatus, "unknown")
  assert.equal(responsive.properties["text.fontSize"]?.effective, null)
  assert.equal(responsive.support.overrideClear, false)
})

test("tree pages are bounded, continuation visits every reachable node once and depth is explicit", async () => {
  const f = editorFixture()
  const seen: string[] = []
  let result = await call(f, "get_node_tree", {
    root: target("hero"),
    depth: 3,
    maxNodes: 1,
  })
  assert.ok("nodes" in result && "live" in result)
  while (true) {
    assert.ok("nodes" in result && "live" in result)
    assert.equal(result.nodes.length, 1)
    seen.push(...result.nodes.map((node) => node.ref.id))
    if (!result.next) break
    result = await call(f, "get_node_tree", {
      cursor: result.next,
      maxNodes: 1,
    })
  }
  assert.deepEqual(seen, ["hero", "title", "future"])
  const limited = await call(f, "get_node_tree", {
    root: target("hero"),
    depth: 0,
  })
  assert.ok("reasons" in limited)
  assert.equal(limited.truncated, true)
  assert.ok(limited.reasons.includes("depth"))
  assert.equal(limited.continuationRoots.length, 2)
})

test("cursor cannot be silently reused with another canvas or incompatible parameters", async () => {
  const f = editorFixture()
  const first = await call(f, "get_node_tree", { maxNodes: 1 })
  assert.ok("next" in first && first.next)
  await assert.rejects(
    call(f, "get_node_tree", { cursor: first.next, depth: 5 }),
    { code: "INVALID_CURSOR" },
  )
  f.setCanvas("desktop")
  await assert.rejects(call(f, "get_node_tree", { cursor: first.next }), {
    code: "INVALID_CURSOR",
  })
})

test("payload budget stops a tree page before transport overflow", async () => {
  const f = editorFixture()
  for (let i = 0; i < 30; i++)
    f.add(`text-${i}`, "hero", "TextNode", {}, "🙂".repeat(2048))
  const result = await call(f, "get_node_tree", {
    root: target("hero"),
    maxNodes: 200,
  })
  assert.ok("reasons" in result)
  assert.ok(result.reasons.includes("payload"))
  assert.ok(result.next)
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).length < 64 * 1024)
})

test("all input validation and preconditions occur before any native write", async () => {
  const f = editorFixture()
  assert.equal(
    inputSchemas.update_node.safeParse({
      node: target("hero"),
      scope: "base",
      changes: { delete: true },
    }).success,
    false,
  )
  assert.equal(
    inputSchemas.update_node.safeParse({
      node: target("hero"),
      scope: "base",
      changes: { layout: {} },
    }).success,
    false,
  )
  assert.equal(
    inputSchemas.update_node.safeParse({
      node: target("hero"),
      scope: "base",
      changes: { text: { content: "A" }, name: "B" },
    }).success,
    false,
  )
  await assert.rejects(
    call(f, "update_node", {
      node: target("hero"),
      scope: "base",
      changes: { name: "New" },
      expected: { revision: "stale" },
    }),
    { code: "PRECONDITION_FAILED" },
  )
  await assert.rejects(
    call(f, "get_node", {
      node: { id: "hero", sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    }),
    { code: "INVALID_REQUEST" },
  )
  await assert.rejects(call(f, "get_node", { node: target("missing") }), {
    code: "NODE_NOT_FOUND",
  })
  assert.equal(f.writes.length, 0)
})

test("base mutation maps safe layout values, reads back and changes the revision", async () => {
  const f = editorFixture()
  const before = nodeSchema.parse(
    await call(f, "get_node", { node: target("hero") }),
  )
  const result = await call(f, "update_node", {
    node: target("hero"),
    scope: "base",
    expected: { revision: before.revision },
    changes: {
      name: "Hero revised",
      layout: {
        width: { mode: "fixed", value: 400 },
        gap: 24,
        padding: { top: 1, right: 2, bottom: 3, left: 4 },
      },
      visual: { opacity: 0.8 },
    },
  })
  assert.ok("snapshot" in result)
  assert.equal(result.changed, true)
  assert.equal(result.snapshot.layout?.width?.raw, "400px")
  assert.equal(result.snapshot.layout?.padding, "1px 2px 3px 4px")
  assert.notEqual(result.snapshot.revision, before.revision)
  assert.equal(f.writes.length, 1)
})

test("plain text replacement is isolated and returns actual content; no-op does not write", async () => {
  const f = editorFixture()
  const result = await call(f, "update_node", {
    node: target("title"),
    scope: "base",
    changes: { text: { content: "New title" } },
  })
  assert.ok("snapshot" in result)
  assert.equal(result.snapshot.text?.content, "New title")
  assert.ok(result.warnings.some((warning) => warning.includes("formatting")))
  await call(f, "update_node", {
    node: target("title"),
    scope: "base",
    changes: { text: { content: "New title" } },
  })
  assert.equal(f.writes.length, 1)
})

test("replica, locked ancestry, component and permission failures never perform a base mutation", async () => {
  const f = editorFixture()
  await assert.rejects(
    call(f, "update_node", {
      node: target("phone-hero"),
      scope: "base",
      changes: { name: "Oops" },
    }),
    { code: "BREAKPOINT_WRITE_UNSUPPORTED" },
  )
  const desktop = f.state.get("desktop")
  assert.ok(desktop)
  desktop.node.locked = true
  const snapshot = nodeSchema.parse(
    await call(f, "get_node", { node: target("hero") }),
  )
  assert.deepEqual(snapshot.capabilities.writableProperties, [])
  await assert.rejects(
    call(f, "update_node", {
      node: target("hero"),
      scope: "base",
      changes: { name: "Oops" },
    }),
    { code: "PROPERTY_UNSUPPORTED" },
  )
  desktop.node.locked = false
  f.permissions.attributes = false
  await assert.rejects(
    call(f, "update_node", {
      node: target("hero"),
      scope: "base",
      changes: { name: "Oops" },
    }),
    { code: "PROPERTY_UNSUPPORTED" },
  )
  f.add("component", null, "ComponentNode")
  f.add("nested", "component")
  f.permissions.attributes = true
  await assert.rejects(
    call(f, "update_node", {
      node: target("nested"),
      scope: "base",
      changes: { name: "Oops" },
    }),
    { code: "PROPERTY_UNSUPPORTED" },
  )
  assert.equal(f.writes.length, 0)
})

test("explicit phone replica override changes only the target and verifies the primary", async () => {
  const f = editorFixture()
  const primary = nodeSchema.parse(
    await call(f, "get_node", { node: target("hero") }),
  )
  const tablet = nodeSchema.parse(
    await call(f, "get_node", { node: target("tablet-hero") }),
  )
  const result = await call(f, "set_breakpoint_override", {
    node: target("phone-hero"),
    breakpoint: target("phone"),
    changes: { layout: { gap: 8 } },
  })
  assert.ok("snapshot" in result)
  assert.equal(result.scope, "breakpoint")
  assert.equal(result.snapshot.layout?.gap, "8px")
  assert.equal(
    nodeSchema.parse(await call(f, "get_node", { node: target("hero") }))
      .revision,
    primary.revision,
  )
  assert.equal(
    nodeSchema.parse(await call(f, "get_node", { node: target("tablet-hero") }))
      .revision,
    tablet.revision,
  )
  assert.equal(f.writes[0]?.id, "phone-hero")
  const state = await call(f, "get_responsive_state", {
    node: target("phone-hero"),
    properties: ["layout.gap"],
  })
  assert.ok("properties" in state)
  assert.equal(state.properties["layout.gap"]?.overrideStatus, "unknown")
})

test("wrong breakpoint, primary target, text/font writes and clear override are safely rejected", async () => {
  const f = editorFixture()
  await assert.rejects(
    call(f, "set_breakpoint_override", {
      node: target("phone-hero"),
      breakpoint: target("tablet"),
      changes: { layout: { gap: 8 } },
    }),
    { code: "BREAKPOINT_NOT_FOUND" },
  )
  await assert.rejects(
    call(f, "set_breakpoint_override", {
      node: target("hero"),
      breakpoint: target("desktop"),
      changes: { layout: { gap: 8 } },
    }),
    { code: "BREAKPOINT_WRITE_UNSUPPORTED" },
  )
  await assert.rejects(
    call(f, "set_breakpoint_override", {
      node: target("phone-title"),
      breakpoint: target("phone"),
      changes: { text: { content: "Oops" } },
    }),
    { code: "PROPERTY_UNSUPPORTED" },
  )
  await assert.rejects(
    call(f, "clear_breakpoint_override", {
      node: target("phone-hero"),
      breakpoint: target("phone"),
      property: "layout.gap",
    }),
    { code: "BREAKPOINT_WRITE_UNSUPPORTED" },
  )
  assert.equal(
    inputSchemas.set_breakpoint_override.safeParse({
      node: target("phone-title"),
      breakpoint: target("phone"),
      changes: { text: { fontSize: 48 } },
    }).success,
    false,
  )
  assert.equal(f.writes.length, 0)
})

test("equal effective values never materialize a replica override", async () => {
  const f = editorFixture()
  const result = await call(f, "set_breakpoint_override", {
    node: target("phone-hero"),
    breakpoint: target("phone"),
    changes: { layout: { gap: 20 } },
  })
  assert.ok("changed" in result)
  assert.equal(result.changed, false)
  assert.equal(f.writes.length, 0)
})

test("side-effect failure or changed primary reports uncertainty and forbids automatic retry", async () => {
  for (const failure of ["failAfterWrite", "mutateOriginal"] as const) {
    const f = editorFixture()
    f.hooks[failure] = true
    await assert.rejects(
      call(f, "set_breakpoint_override", {
        node: target("phone-hero"),
        breakpoint: target("phone"),
        changes: { layout: { gap: 8 } },
      }),
      { code: "MUTATION_RESULT_UNKNOWN", retryable: false },
    )
    assert.equal(f.writes.length, 1)
  }
})

test("expired or cancelled queued mutations never execute", async () => {
  const f = editorFixture()
  let release: () => void = () => {}
  f.hooks.beforeWrite = () =>
    new Promise<void>((resolve) => {
      release = resolve
    })
  const first = call(f, "update_node", {
    node: target("hero"),
    scope: "base",
    changes: { name: "First" },
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const expired = f.adapter.handle(
    "update_node",
    { node: target("hero"), scope: "base", changes: { name: "Late" } },
    { signal: new AbortController().signal, deadlineAt: Date.now() + 10 },
  )
  const error = assert.rejects(expired, { code: "BRIDGE_TIMEOUT" })
  await new Promise((resolve) => setTimeout(resolve, 20))
  release()
  await first
  await error
  assert.equal(f.writes.length, 1)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    f.adapter.handle(
      "update_node",
      { node: target("hero"), scope: "base", changes: { name: "Cancelled" } },
      { signal: controller.signal, deadlineAt: Date.now() + 1000 },
    ),
    { code: "SESSION_DISCONNECTED" },
  )
})

test("mutation RPC timeout is non-retryable and malformed method results are rejected", async () => {
  const sender = new RpcPeer(() => {}, 15)
  try {
    await assert.rejects(
      sender.request("update_node", {
        node: target("hero"),
        scope: "base",
        changes: { name: "New" },
      }),
      { code: "BRIDGE_TIMEOUT", retryable: false },
    )
  } finally {
    sender.close()
  }
  const sent: Array<{ id: string }> = []
  const peer = new RpcPeer((message) => {
    sent.push(message)
  }, 100)
  const result = peer.request("get_project", {})
  peer.receive({
    kind: "response",
    id: sent[0]?.id ?? "",
    ok: true,
    result: { alive: true },
  })
  await assert.rejects(result, { code: "INVALID_REQUEST" })
  peer.close()
})

test("selection summaries never fetch full text content", async () => {
  const f = editorFixture()
  const selected = await f.api.getNode("title")
  assert.ok(selected)
  selected.readText = async () => {
    throw new Error("Should not read full text for selection summaries")
  }
  f.api.getSelection = async () => [selected]
  const result = await call(f, "get_selection", {})
  assert.ok("total" in result)
  assert.equal(result.total, 1)
})

test("native breakpoint variant flags permit primary edits while component variants remain protected", async () => {
  const f = editorFixture()
  const hero = nodeSchema.parse(
    await call(f, "get_node", { node: target("hero") }),
  )
  assert.ok(hero.capabilities.writableProperties.includes("name"))
  await call(f, "update_node", {
    node: target("hero"),
    scope: "base",
    changes: { name: "Reviewed" },
    expected: { revision: hero.revision },
  })
  f.add("variant", null, "FrameNode", { isVariant: true })
  f.add("variant-child", "variant")
  const protectedNode = nodeSchema.parse(
    await call(f, "get_node", { node: target("variant-child") }),
  )
  assert.deepEqual(protectedNode.capabilities.writableProperties, [])
  f.add("definition", null, "ComponentNode")
  f.add("dual-flags", "definition", "FrameNode", {
    isVariant: true,
    isBreakpoint: true,
    isPrimaryBreakpoint: true,
  })
  assert.deepEqual(
    nodeSchema.parse(await call(f, "get_node", { node: target("dual-flags") }))
      .capabilities.writableProperties,
    [],
  )
  assert.equal(f.writes.length, 1)
})
