import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  exportOptionsSchema,
  snapshotSchema,
  toDesignIR,
} from "@framer-plus/design"
import { ArtifactStore } from "../src/design/artifacts.js"

const snapshot = snapshotSchema.parse(
  JSON.parse(
    await readFile(
      new URL("../../../fixtures/landing.snapshot.json", import.meta.url),
      "utf8",
    ),
  ),
)
const options = exportOptionsSchema.parse(
  JSON.parse(
    await readFile(
      new URL("../../../fixtures/landing.options.json", import.meta.url),
      "utf8",
    ),
  ),
)
test("private artifacts verify integrity and regeneration baseline before writing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fp-artifacts-"))
  try {
    const store = new ArtifactStore(dir)
    const saved = await store.save(snapshot, toDesignIR(snapshot))
    assert.equal((await stat(saved.path)).mode & 0o777, 0o600)
    assert.deepEqual((await store.load(saved.id)).snapshot, snapshot)
    await assert.rejects(store.load("../escape"))
    const output = await store.generate(saved.id, options)
    await writeFile(join(output.path, "notes.txt"), "custom")
    const regenerated = await store.regenerate(output.id, saved.id, options)
    assert.equal(regenerated.status, "generated")
    if (regenerated.status === "generated")
      assert.equal(
        await readFile(join(regenerated.path, "notes.txt"), "utf8"),
        "custom",
      )
    await writeFile(join(output.path, ".framer-plus.json"), "{}")
    await assert.rejects(store.regenerate(output.id, saved.id, options))
    await writeFile(saved.path, "{}")
    await assert.rejects(store.load(saved.id))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
