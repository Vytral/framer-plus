import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  generateReact,
  toDesignIR,
  writeNewProject,
} from "../packages/design/dist/index.js"

const root = process.cwd()
const temp = await mkdtemp(join(tmpdir(), "framer-plus-export-"))
try {
  const snapshot = JSON.parse(
    await readFile(join(root, "fixtures/landing.snapshot.json"), "utf8"),
  )
  const options = JSON.parse(
    await readFile(join(root, "fixtures/landing.options.json"), "utf8"),
  )
  const roles = JSON.parse(
    await readFile(join(root, "fixtures/landing.roles.json"), "utf8"),
  )
  const project = generateReact(toDesignIR(snapshot, roles), options)
  const dir = await writeNewProject(join(temp, "landing"), project.files)
  // Use existing exact-version workspace dependencies: no registry/network needed.
  const modules = join(root, "apps/plugin/node_modules")
  await symlink(modules, join(dir, "node_modules"), "dir")
  for (const [binary, args] of [
    ["tsc", ["--noEmit"]],
    ["vite", ["build"]],
  ]) {
    const result = spawnSync(join(modules, ".bin", binary), args, {
      cwd: dir,
      stdio: "inherit",
    })
    if (result.status !== 0)
      throw Error("Standalone generated project failed verification")
  }
  console.log(
    "Generated fixture passes strict TypeScript and production Vite build; dependencies reused locally, fresh registry installation is not certified.",
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
