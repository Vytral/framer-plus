import assert from "node:assert/strict"
import test from "node:test"
import {
  BridgeError,
  inputSchemas,
  type Method,
  type MethodInput,
  type MethodResult,
  resultSchemas,
} from "@framer-plus/protocol"
import { TEST_SESSION } from "./fixtures/editor.js"
import { projectFixture } from "./fixtures/project.js"

function required<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined)
  return value
}
const node = (id: string) => ({ id, sessionId: TEST_SESSION })
const context = () => ({
  signal: new AbortController().signal,
  deadlineAt: Date.now() + 15000,
})
async function call<M extends Method>(
  f: ReturnType<typeof projectFixture>,
  method: M,
  params: MethodInput<M>,
): Promise<MethodResult<M>> {
  return resultSchemas[method].parse(
    await f.adapter.handle(method, params, context()),
  ) as MethodResult<M>
}
async function rejects(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e) => e instanceof BridgeError && e.code === code)
}
async function plan(
  f: ReturnType<typeof projectFixture>,
  ids = ["hero", "title"],
) {
  const operations = []
  for (const id of ids) {
    const s = await call(f, "get_node", { node: node(id) })
    operations.push({
      node: node(id),
      scope: "base" as const,
      changes: { name: `new-${id}` },
      expected: { revision: s.revision },
    })
  }
  return call(f, "plan_changes", { title: "Rename selected nodes", operations })
}

test("components resolve identifiers and concrete variants without fabricating override provenance", async () => {
  const f = projectFixture()
  const s = await call(f, "get_component", { node: node("button") })
  assert.equal(s.definition?.id, "button-definition")
  assert.equal(s.kind, "instance")
  assert.equal(
    s.variants.find((v) => v.gesture === "hover")?.inheritsFrom?.id,
    "default-variant",
  )
  assert.equal(s.controls.binding?.available, false)
  assert.equal(s.controls.label?.override, "unknown")
  assert.equal(s.controls.label?.writable, true)
  required(required(f.state.get("button")).node.component).identifier =
    "external"
  const external = await call(f, "get_component", { node: node("button") })
  assert.equal(external.resolution, "external_or_unavailable")
  assert.equal(external.definition, null)
})
test("instance edits write only supplied primitive controls and preserve siblings, definition and bindings", async () => {
  const f = projectFixture()
  const before = await call(f, "get_component", { node: node("button") })
  const original = structuredClone(required(f.state.get("other-button")).node)
  const definition = structuredClone(
    required(f.state.get("button-definition")).node,
  )
  const result = await call(f, "update_instance", {
    node: node("button"),
    scope: "instance",
    controls: { label: "Checkout" },
    expected: { revision: before.revision },
  })
  assert.equal(result.snapshot.controls.label?.value, "Checkout")
  assert.deepEqual(f.projectWrites[0]?.value, { label: "Checkout" })
  assert.equal(
    required(required(f.state.get("button")).node.component).controls.radius,
    8,
  )
  assert.deepEqual(
    required(required(f.state.get("button")).node.component).controls.binding,
    {
      id: "variable",
    },
  )
  assert.deepEqual(required(f.state.get("other-button")).node, original)
  assert.deepEqual(required(f.state.get("button-definition")).node, definition)
  await rejects(
    call(f, "update_instance", {
      node: node("button"),
      scope: "instance",
      controls: { label: "Again" },
      expected: { revision: before.revision },
    }),
    "PRECONDITION_FAILED",
  )
})
test("unsupported instance control types, locks, replica scope and clear never write", async () => {
  const f = projectFixture()
  let s = await call(f, "get_component", { node: node("button") })
  const invalidControls: Array<MethodInput<"update_instance">["controls"]> = [
    { radius: "wrong" },
    { missing: 2 },
    { binding: "replace" },
  ]
  for (const controls of invalidControls)
    await rejects(
      call(f, "update_instance", {
        node: node("button"),
        scope: "instance",
        controls,
        expected: { revision: s.revision },
      }),
      "PROPERTY_UNSUPPORTED",
    )
  await rejects(
    call(f, "clear_instance_override", {
      node: node("button"),
      property: "label",
    }),
    "OVERRIDE_CLEAR_UNSUPPORTED",
  )
  required(f.state.get("hero")).node.locked = true
  s = await call(f, "get_component", { node: node("button") })
  await rejects(
    call(f, "update_instance", {
      node: node("button"),
      scope: "instance",
      controls: { label: "x" },
      expected: { revision: s.revision },
    }),
    "CAPABILITY_UNAVAILABLE",
  )
  assert.equal(f.projectWrites.length, 0)
})
test("styles and referenced assets are normalized and bindings reuse shared styles", async () => {
  const f = projectFixture()
  const styles = await call(f, "get_styles", {
    kind: "color",
    offset: 0,
    limit: 50,
  })
  assert.equal(styles.items[0]?.id, "brand")
  const assets = await call(f, "get_assets", {
    kind: "image",
    offset: 0,
    limit: 50,
  })
  assert.equal(assets.items.length, 1)
  const svg = await call(f, "get_assets", { kind: "svg", offset: 0, limit: 50 })
  assert.ok(svg.items[0] && "byteLength" in svg.items[0])
  assert.equal(svg.items[0].byteLength, 120)
  assert.ok(assets.items[0] && "nodes" in assets.items[0])
  assert.deepEqual(
    assets.items[0].nodes.map((n) => n.id),
    ["hero", "other-button"],
  )
  const s = await call(f, "get_node", { node: node("hero") })
  const bound = await call(f, "apply_style", {
    node: node("hero"),
    scope: "base",
    kind: "color",
    styleId: "brand",
    expected: { revision: s.revision },
  })
  assert.equal(bound.snapshot.visual?.background?.kind, "style")
  assert.equal(f.colors[0]?.light, "rgba(1,2,3,1)")
  assert.equal(f.projectWrites.length, 1)
  const noop = await call(f, "apply_style", {
    node: node("hero"),
    scope: "base",
    kind: "color",
    styleId: "brand",
    expected: { revision: bound.snapshot.revision },
  })
  assert.equal(noop.changed, false)
  assert.equal(f.projectWrites.length, 1)
  const text = await call(f, "get_node", { node: node("title") })
  const textBound = await call(f, "apply_style", {
    node: node("title"),
    scope: "base",
    kind: "text",
    styleId: "heading",
    expected: { revision: text.revision },
  })
  assert.equal(textBound.snapshot.text?.style?.id, "heading")
})
test("style writes reject replicas and missing styles; readback failures are uncertain", async () => {
  const f = projectFixture()
  const s = await call(f, "get_node", { node: node("hero") })
  await rejects(
    call(f, "apply_style", {
      node: node("hero"),
      scope: "base",
      kind: "color",
      styleId: "absent",
      expected: { revision: s.revision },
    }),
    "RESOURCE_NOT_FOUND",
  )
  await rejects(
    call(f, "apply_style", {
      node: node("phone-hero"),
      scope: "base",
      kind: "color",
      styleId: "brand",
      expected: { revision: s.revision },
    }),
    "CAPABILITY_UNAVAILABLE",
  )
  assert.equal(f.projectWrites.length, 0)
  f.settings.failBinding = true
  await rejects(
    call(f, "apply_style", {
      node: node("hero"),
      scope: "base",
      kind: "color",
      styleId: "brand",
      expected: { revision: s.revision },
    }),
    "MUTATION_RESULT_UNKNOWN",
  )
})
test("CMS schemas expose ownership; scalar patches preserve unrelated fields, slug and draft", async () => {
  const f = projectFixture()
  const schema = await call(f, "get_collection_schema", {
    collectionId: "articles",
  })
  assert.equal(schema.fields.find((f) => f.id === "rich")?.writable, false)
  const list = await call(f, "get_collection_items", {
    collectionId: "articles",
    offset: 0,
    limit: 50,
  })
  const item = required(list.items[0])
  assert.equal(item.fields.rich?.available, false)
  const result = await call(f, "update_collection_item", {
    collectionId: "articles",
    itemId: item.id,
    fields: {
      title: { type: "string", value: "After" },
      active: { type: "boolean", value: true },
    },
    expected: { revision: item.revision },
  })
  assert.equal(result.snapshot.fields.title?.value, "After")
  assert.equal(result.snapshot.fields.count?.value, 1)
  assert.equal(result.snapshot.slug, "article")
  assert.equal(result.snapshot.draft, true)
  assert.deepEqual(f.records[0]?.fields.rich.value, { html: "rich" })
  await rejects(
    call(f, "update_collection_item", {
      collectionId: "articles",
      itemId: item.id,
      fields: { title: { type: "string", value: "Again" } },
      expected: { revision: item.revision },
    }),
    "PRECONDITION_FAILED",
  )
})
test("CMS ownership, permissions, types, bound/required fields are validated before write", async () => {
  const f = projectFixture()
  const item = (
    await call(f, "get_collection_items", {
      collectionId: "articles",
      offset: 0,
      limit: 50,
    })
  ).items[0]
  assert.ok(item)
  const patch = (fields: MethodInput<"update_collection_item">["fields"]) =>
    call(f, "update_collection_item", {
      collectionId: "articles",
      itemId: item.id,
      fields,
      expected: { revision: item.revision },
    })
  await rejects(
    patch({ title: { type: "number", value: 2 } }),
    "PROPERTY_UNSUPPORTED",
  )
  await rejects(
    patch({ title: { type: "string", value: " " } }),
    "PROPERTY_UNSUPPORTED",
  )
  required(f.fields[0]).basedOn = "source"
  await rejects(
    patch({ title: { type: "string", value: "value" } }),
    "PROPERTY_UNSUPPORTED",
  )
  required(f.fields[0]).basedOn = null
  f.settings.managedBy = "anotherPlugin"
  await rejects(
    patch({ title: { type: "string", value: "value" } }),
    "CAPABILITY_UNAVAILABLE",
  )
  f.settings.managedBy = "user"
  f.settings.cmsPermission = false
  await rejects(
    patch({ title: { type: "string", value: "value" } }),
    "CAPABILITY_UNAVAILABLE",
  )
  assert.equal(f.projectWrites.length, 0)
})
test("planning performs no writes, requires exact local approval, executes once and audits without content", async () => {
  const f = projectFixture()
  const p = await plan(f)
  assert.equal(f.writes.length, 0)
  await rejects(
    call(f, "execute_change_plan", { planId: p.id }),
    "APPROVAL_REQUIRED",
  )
  assert.equal(f.writes.length, 0)
  const initial = required(p.operations[0])
  assert.ok("changes" in initial)
  initial.changes.name = "tampered"
  f.adapter.projectOperations.decide(p.id, true)
  const result = await call(f, "execute_change_plan", { planId: p.id })
  assert.equal(result.status, "completed")
  assert.equal(required(f.state.get("hero")).node.name, "new-hero")
  assert.equal(result.results.length, 2)
  await rejects(
    call(f, "execute_change_plan", { planId: p.id }),
    "APPROVAL_REQUIRED",
  )
  assert.equal(f.writes.length, 2)
  const log = await call(f, "get_audit_log", {})
  const json = JSON.stringify(log)
  assert.ok(log.entries.some((e) => e.planId === p.id))
  assert.ok(!json.includes("new-hero"))
  assert.ok(!json.includes("tampered"))
})
test("all batch preconditions run before first write; branch switches and changed targets invalidate plans", async () => {
  const f = projectFixture()
  const p = await plan(f)
  f.adapter.projectOperations.decide(p.id, true)
  required(f.state.get("title")).text = "changed"
  await rejects(
    call(f, "execute_change_plan", { planId: p.id }),
    "PRECONDITION_FAILED",
  )
  assert.equal(f.writes.length, 0)
  const next = await plan(f)
  f.adapter.projectOperations.decide(next.id, true)
  f.settings.branchId = "other"
  await rejects(
    call(f, "execute_change_plan", { planId: next.id }),
    "PRECONDITION_FAILED",
  )
  assert.equal(f.writes.length, 0)
})
test("batch stops after uncertainty, reports partial results and never replays", async () => {
  const f = projectFixture()
  f.add("third", "hero")
  const p = await plan(f, ["hero", "title", "third"])
  f.adapter.projectOperations.decide(p.id, true)
  let writes = 0
  f.hooks.beforeWrite = async () => {
    writes++
    f.hooks.failAfterWrite = writes === 2
  }
  const result = await call(f, "execute_change_plan", { planId: p.id })
  assert.equal(result.status, "partial")
  assert.deepEqual(
    result.results.map((r) => r.status),
    ["verified", "failed", "skipped"],
  )
  assert.equal(result.results[1]?.code, "MUTATION_RESULT_UNKNOWN")
  assert.equal(f.writes.length, 2)
  assert.equal(required(f.state.get("third")).node.name, "third")
  await rejects(
    call(f, "execute_change_plan", { planId: p.id }),
    "APPROVAL_REQUIRED",
  )
})
test("plan rejection and transport revocation prevent execution; payload, duplicate and cross-session targets reject", async () => {
  const f = projectFixture()
  const p = await plan(f)
  f.adapter.projectOperations.decide(p.id, false)
  await rejects(
    call(f, "execute_change_plan", { planId: p.id }),
    "APPROVAL_REQUIRED",
  )
  const next = await plan(f)
  f.adapter.projectOperations.decide(next.id, true)
  f.adapter.projectOperations.revoke()
  await rejects(
    call(f, "execute_change_plan", { planId: next.id }),
    "APPROVAL_REQUIRED",
  )
  const op = required(next.operations[0])
  assert.ok(op.scope === "base" || op.scope === "breakpoint")
  await rejects(
    call(f, "plan_changes", { title: "duplicate", operations: [op, op] }),
    "INVALID_REQUEST",
  )
  await rejects(
    call(f, "plan_changes", {
      title: "other session",
      operations: [
        {
          ...op,
          node: {
            ...op.node,
            sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
        },
      ],
    }),
    "INVALID_REQUEST",
  )
  assert.equal(f.writes.length, 0)
  assert.equal(
    inputSchemas.update_instance.safeParse({
      node: node("button"),
      scope: "instance",
      controls: JSON.parse('{"__proto__":"pollute"}'),
      expected: { revision: "v1:x" },
    }).success,
    false,
  )
})
test("resource pages obey byte budgets and signal unavailable complex data", async () => {
  const f = projectFixture()
  for (let i = 0; i < 40; i++)
    f.colors.push({
      id: `color-${i}`,
      name: `Color ${i}`,
      light: "x".repeat(4096),
      dark: null,
    })
  const page = await call(f, "get_styles", {
    kind: "color",
    offset: 0,
    limit: 100,
  })
  assert.ok(page.nextOffset !== null)
  assert.ok(Buffer.byteLength(JSON.stringify(page)) < 64 * 1024)
  const next = await call(f, "get_styles", {
    kind: "color",
    offset: required(page.nextOffset),
    limit: 100,
  })
  assert.notEqual(next.items[0]?.id, page.items[0]?.id)
})

test("expired plans cannot be approved or executed and native failures forbid retry", async (t) => {
  const f = projectFixture()
  const p = await plan(f)
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 6 * 60_000 })
  assert.equal(
    (await call(f, "get_change_plan", { planId: p.id })).status,
    "expired",
  )
  f.adapter.projectOperations.decide(p.id, true)
  await rejects(
    call(f, "execute_change_plan", { planId: p.id }),
    "APPROVAL_REQUIRED",
  )
  assert.equal(f.writes.length, 0)
  t.mock.timers.reset()
  const s = await call(f, "get_component", { node: node("button") })
  f.settings.failAfterWrite = true
  await rejects(
    call(f, "update_instance", {
      node: node("button"),
      scope: "instance",
      controls: { label: "uncertain" },
      expected: { revision: s.revision },
    }),
    "MUTATION_RESULT_UNKNOWN",
  )
  assert.equal(f.projectWrites.length, 1)
})

test("revisions cannot be reused across branches even when node or CMS scalar values match", async () => {
  const f = projectFixture()
  const snapshot = await call(f, "get_node", { node: node("hero") })
  const item = (
    await call(f, "get_collection_items", {
      collectionId: "articles",
      offset: 0,
      limit: 50,
    })
  ).items[0]
  assert.ok(item)
  f.settings.branchId = "copy"
  await rejects(
    call(f, "update_node", {
      node: node("hero"),
      scope: "base",
      changes: { name: "other branch" },
      expected: { revision: snapshot.revision },
    }),
    "PRECONDITION_FAILED",
  )
  await rejects(
    call(f, "update_collection_item", {
      collectionId: "articles",
      itemId: item.id,
      fields: { title: { type: "string", value: "other branch" } },
      expected: { revision: item.revision },
    }),
    "PRECONDITION_FAILED",
  )
  assert.equal(f.writes.length, 0)
  assert.equal(f.projectWrites.length, 0)
})

test("large component variant catalogs truncate within transport budget", async () => {
  const f = projectFixture()
  for (let i = 0; i < 100; i++)
    f.add(`variant-${i}`, "button-definition", "FrameNode", {
      name: "長".repeat(512),
      isVariant: true,
      variant: { primary: false, gesture: null },
    })
  const snapshot = await call(f, "get_component", { node: node("button") })
  assert.equal(snapshot.truncated, true)
  assert.ok(snapshot.variants.length < 100)
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 48 * 1024)
})

test("page discovery paginates web and design pages with active identity", async () => {
  const f = projectFixture()
  f.add("about-page", null, "WebPageNode", { path: "/about" })
  f.add("scratch", null, "DesignPageNode")
  const first = await call(f, "get_pages", { kind: "web", offset: 0, limit: 1 })
  assert.equal(first.items[0]?.ref.id, "page")
  assert.equal(first.items[0]?.active, true)
  assert.equal(first.nextOffset, 1)
  const second = await call(f, "get_pages", {
    kind: "web",
    offset: 1,
    limit: 1,
  })
  assert.equal(second.items[0]?.path, "/about")
  assert.equal(second.items[0]?.active, false)
  const designs = await call(f, "get_pages", {
    kind: "design",
    offset: 0,
    limit: 50,
  })
  assert.equal(designs.items[0]?.ref.id, "scratch")
  assert.equal(designs.items.length, 1)
})
test("reviewed plans span pages, views, component controls, styles and CMS without writes during preparation", async () => {
  const f = projectFixture()
  f.add("page-two", null, "WebPageNode", { path: "/two" })
  f.add("second-section", "page-two")
  const hero = await call(f, "get_node", { node: node("hero") })
  const phone = await call(f, "get_node", { node: node("phone-hero") })
  const section = await call(f, "get_node", { node: node("second-section") })
  const component = await call(f, "get_component", { node: node("button") })
  const items = await call(f, "get_collection_items", {
    collectionId: "articles",
    offset: 0,
    limit: 50,
  })
  const item = required(items.items[0])
  const p = await call(f, "plan_changes", {
    title: "Cross-project-resource review",
    operations: [
      {
        scope: "base",
        node: node("hero"),
        changes: { name: "Reviewed hero" },
        expected: { revision: hero.revision },
      },
      {
        scope: "breakpoint",
        node: node("phone-hero"),
        breakpoint: node("phone"),
        changes: { layout: { gap: 12 } },
        expected: { revision: phone.revision },
      },
      {
        scope: "style",
        node: node("second-section"),
        kind: "color",
        styleId: "brand",
        expected: { revision: section.revision },
      },
      {
        scope: "instance",
        node: node("button"),
        controls: { label: "Reviewed label" },
        expected: { revision: component.revision },
      },
      {
        scope: "cms",
        collectionId: "articles",
        itemId: item.id,
        fields: { count: { type: "number", value: 8 } },
        expected: { revision: item.revision },
      },
    ],
  })
  assert.equal(f.writes.length, 0)
  assert.equal(f.projectWrites.length, 0)
  assert.equal(p.preview[2]?.page?.id, "page-two")
  assert.equal(p.preview[1]?.breakpoint?.id, "phone")
  assert.equal(p.preview[4]?.node, undefined)
  await rejects(
    call(f, "execute_change_plan", { planId: p.id }),
    "APPROVAL_REQUIRED",
  )
  f.adapter.projectOperations.decide(p.id, true)
  const result = await call(f, "execute_change_plan", { planId: p.id })
  assert.equal(result.status, "completed")
  assert.equal(result.results.length, 5)
  assert.equal(result.results[4]?.itemId, item.id)
  assert.equal(required(f.records[0]).fields.count?.value, 8)
  assert.equal(required(f.state.get("hero")).node.layout?.gap, "20px")
  assert.equal(required(f.state.get("phone-hero")).node.layout?.gap, "12px")
})
test("mixed-plan preflight rejects a stale CMS target before any native write", async () => {
  const f = projectFixture()
  const hero = await call(f, "get_node", { node: node("hero") })
  const item = required(
    (
      await call(f, "get_collection_items", {
        collectionId: "articles",
        offset: 0,
        limit: 50,
      })
    ).items[0],
  )
  const p = await call(f, "plan_changes", {
    title: "Preflight all resources",
    operations: [
      {
        scope: "base",
        node: node("hero"),
        changes: { name: "Do not apply" },
        expected: { revision: hero.revision },
      },
      {
        scope: "cms",
        collectionId: "articles",
        itemId: item.id,
        fields: { count: { type: "number", value: 8 } },
        expected: { revision: item.revision },
      },
    ],
  })
  f.adapter.projectOperations.decide(p.id, true)
  required(f.records[0]).fields.count = { type: "number", value: 9 }
  await rejects(
    call(f, "execute_change_plan", { planId: p.id }),
    "PRECONDITION_FAILED",
  )
  assert.equal(f.writes.length, 0)
  assert.equal(f.projectWrites.length, 0)
})
test("mixed-plan unknown outcomes stop subsequent resource writes and cannot replay", async () => {
  const f = projectFixture()
  const hero = await call(f, "get_node", { node: node("hero") })
  const component = await call(f, "get_component", { node: node("button") })
  const item = required(
    (
      await call(f, "get_collection_items", {
        collectionId: "articles",
        offset: 0,
        limit: 50,
      })
    ).items[0],
  )
  const p = await call(f, "plan_changes", {
    title: "Stop mixed resources",
    operations: [
      {
        scope: "base",
        node: node("hero"),
        changes: { name: "Verified" },
        expected: { revision: hero.revision },
      },
      {
        scope: "instance",
        node: node("button"),
        controls: { label: "May apply" },
        expected: { revision: component.revision },
      },
      {
        scope: "cms",
        collectionId: "articles",
        itemId: item.id,
        fields: { count: { type: "number", value: 8 } },
        expected: { revision: item.revision },
      },
    ],
  })
  f.adapter.projectOperations.decide(p.id, true)
  f.settings.failAfterWrite = true
  const result = await call(f, "execute_change_plan", { planId: p.id })
  assert.equal(result.status, "partial")
  assert.deepEqual(
    result.results.map((r) => r.status),
    ["verified", "failed", "skipped"],
  )
  assert.equal(result.results[1]?.code, "MUTATION_RESULT_UNKNOWN")
  assert.ok(!f.projectWrites.some((w) => w.kind === "cms"))
  await rejects(
    call(f, "execute_change_plan", { planId: p.id }),
    "APPROVAL_REQUIRED",
  )
})

test("explicit page navigation checks the active canvas and invalidates cursors and approvals without design writes", async () => {
  const f = projectFixture()
  f.add("page-two", null, "WebPageNode", { path: "/second" })
  const hero = await call(f, "get_node", { node: node("hero") })
  const cursor = await call(f, "get_node_tree", { maxNodes: 1 })
  const plan = await call(f, "plan_changes", {
    title: "Old page plan",
    operations: [
      {
        scope: "base",
        node: node("hero"),
        changes: { name: "Never apply" },
        expected: { revision: hero.revision },
      },
    ],
  })
  f.adapter.projectOperations.decide(plan.id, true)
  const result = await call(f, "open_page", {
    page: node("page-two"),
    expectedCanvas: node("page"),
  })
  assert.equal(result.canvasRoot.id, "page-two")
  assert.equal(result.previousCanvas.id, "page")
  assert.equal(f.writes.length, 0)
  assert.equal(f.projectWrites.length, 0)
  await rejects(
    call(f, "open_page", { page: node("page"), expectedCanvas: node("page") }),
    "PRECONDITION_FAILED",
  )
  await rejects(
    call(f, "open_page", {
      page: node("hero"),
      expectedCanvas: node("page-two"),
    }),
    "NODE_TYPE_UNSUPPORTED",
  )
  await rejects(
    call(f, "get_node_tree", { cursor: cursor.next }),
    "INVALID_CURSOR",
  )
  await rejects(
    call(f, "execute_change_plan", { planId: plan.id }),
    "APPROVAL_REQUIRED",
  )
})
