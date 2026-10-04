import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  canonical,
  compareDesigns,
  ExportBlocked,
  generateReact,
  readProject,
  regenerateProject,
  toDesignIR,
  validatePath,
  writeNewProject,
} from "../src/index.js"

const snapshot = JSON.parse(
  await readFile(
    new URL("../../../fixtures/landing.snapshot.json", import.meta.url),
    "utf8",
  ),
)
const roles = JSON.parse(
  await readFile(
    new URL("../../../fixtures/landing.roles.json", import.meta.url),
    "utf8",
  ),
)
const options = JSON.parse(
  await readFile(
    new URL("../../../fixtures/landing.options.json", import.meta.url),
    "utf8",
  ),
)
const ir = toDesignIR(snapshot, roles)
test("IR is deterministic, independent of session and revision, and conservatively annotated", () => {
  const next = structuredClone(snapshot)
  for (const n of next.nodes) {
    n.ref.sessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    n.revision = "new"
    if (n.parent) n.parent.sessionId = n.ref.sessionId
    for (const c of n.children ?? []) c.sessionId = n.ref.sessionId
  }
  for (const b of next.breakpoints) {
    b.ref.sessionId = next.nodes[0].ref.sessionId
    if (b.inheritsFrom) b.inheritsFrom.sessionId = b.ref.sessionId
  }
  assert.equal(canonical(toDesignIR(next, roles)), canonical(ir))
  assert.ok(ir.diagnostics.some((d) => d.severity === "unsupported"))
  assert.equal(ir.nodes.find((n) => n.id === "headline")?.role, "h1")
  assert.ok(ir.tokens.length)
})
test("invalid hierarchy and incompatible semantics are rejected", () => {
  const duplicate = structuredClone(snapshot)
  duplicate.nodes.push(duplicate.nodes[0])
  assert.throws(() => toDesignIR(duplicate), /Duplicate/)
  const cycle = structuredClone(snapshot)
  cycle.nodes[1].children.push(cycle.nodes[0].ref)
  assert.throws(() => toDesignIR(cycle), /cycle/)
  assert.throws(
    () => toDesignIR(snapshot, { roles: { page: "h1" } }),
    /require text/,
  )
  const incomplete = structuredClone(snapshot)
  incomplete.nodes.pop()
  assert.ok(
    toDesignIR(incomplete).diagnostics.some((d) => d.code === "MISSING_NODE"),
  )
})
test("React export requires acknowledgement and explicit non-overlapping responsive ranges", () => {
  assert.throws(() => generateReact(ir), ExportBlocked)
  assert.throws(() => generateReact(ir, { ...options, ranges: [] }), /range/i)
  const project = generateReact(ir, options)
  assert.equal(canonical(project), canonical(generateReact(ir, options)))
  assert.ok(project.files["src/styles.css"]?.includes("@media"))
  assert.ok(Object.keys(project.files).some((p) => p.startsWith("src/Section")))
  assert.ok(project.manifest.sources.some((s) => s.nodeId === "headline"))
  assert.ok(project.files["src/styles.css"]?.includes("--color-"))
})
test("generated source matches reviewed landing golden files", async () => {
  const project = generateReact(ir, options)
  for (const name of ["src/Page.tsx", "src/styles.css"])
    assert.equal(
      project.files[name],
      await readFile(
        new URL(`../../../fixtures/golden/${name}`, import.meta.url),
        "utf8",
      ),
    )
})
test("comparison rejects unrelated sources and identifies precise changes", () => {
  const next = structuredClone(ir)
  const node = next.nodes.find((n) => n.id === "headline")
  assert.ok(node)
  node.name = "Changed"
  assert.deepEqual(compareDesigns(ir, next), [
    { nodeId: "headline", kind: "changed" },
  ])
  next.project.branchId = "other"
  assert.throws(() => compareDesigns(ir, next), /same project/i)
})
test("regeneration preserves edits, rejects collisions, and never modifies the previous directory", async () => {
  const temp = await mkdtemp(join(tmpdir(), "fp-test-"))
  try {
    const old = join(temp, "old")
    const generated = generateReact(ir, options)
    await writeNewProject(old, generated.files)
    await assert.rejects(writeNewProject(old, generated.files))
    await writeFile(join(old, "user.txt"), "my notes")
    await writeFile(join(old, "src/Page.tsx"), "custom page")
    const unchanged = await regenerateProject(
      old,
      generated,
      join(temp, "preserved"),
    )
    assert.equal(unchanged.status, "generated")
    assert.equal(
      (await readProject(join(temp, "preserved")))["src/Page.tsx"],
      "custom page",
    )
    assert.equal(
      (await readProject(join(temp, "preserved")))["user.txt"],
      "my notes",
    )
    const next = generateReact(ir, { ...options, title: "New title" })
    next.files["src/Page.tsx"] = "upstream change"
    const conflict = await regenerateProject(old, next, join(temp, "conflict"))
    assert.equal(conflict.status, "conflict")
    assert.ok(conflict.conflicts.includes("src/Page.tsx"))
    assert.equal((await readProject(old))["src/Page.tsx"], "custom page")
    await symlink(join(old, "user.txt"), join(old, "linked.txt"))
    await assert.rejects(readProject(old), /symlink/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})
test("artifact paths reject traversal and prototype keys", () => {
  for (const path of ["../x", "/x", "a/../b", "__proto__", "a/constructor"])
    assert.throws(() => validatePath(path))
  validatePath("src/Page.tsx")
})
test("hand-authored IR cannot suppress unsupported semantics or inject source/CSS", () => {
  const input = structuredClone(ir)
  input.diagnostics = []
  assert.throws(() => generateReact(input), ExportBlocked)
  const headline = input.nodes.find((n) => n.id === "headline")
  assert.ok(headline?.text)
  headline.text.content = "</script><img src=x onerror=alert(1)>"
  const root = input.nodes.find((n) => n.id === "desktop")
  assert.ok(root?.layout?.width)
  root.layout.width.raw = "1px; } body { background: red"
  const output = generateReact(input, options)
  assert.ok(!output.files["src/styles.css"]?.includes("background: red"))
  const section = Object.entries(output.files).find(([path]) =>
    path.startsWith("src/SectionHero"),
  )
  assert.ok(section)
  assert.ok(!section[1].includes("</script>"))
  assert.ok(section[1].includes("\\u003c"))
})
