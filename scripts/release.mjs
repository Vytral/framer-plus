import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = process.cwd()
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
if (!/^\d+\.\d+\.\d+-alpha\.\d+$/.test(pkg.version))
  throw Error(
    "This preparation workflow only creates alpha artifacts; stable releases require separate acceptance",
  )
const output = resolve("build/releases")
await mkdir(output, { recursive: true })
const archive = join(output, `framer-plus-${pkg.version}.tar.gz`)
const stage = await mkdtemp(join(tmpdir(), "framer-plus-release-"))
const allowed = [
  "apps",
  "packages",
  "docs",
  "fixtures",
  "scripts",
  ".github",
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "biome.json",
  ".gitignore",
]
const skip = new Set([
  "node_modules",
  ".git",
  "build",
  ".DS_Store",
  "__MACOSX",
  ".claude",
  ".codex",
  "coverage",
  ".cache",
])
const filter = (path) =>
  !path
    .split(/[\\/]/)
    .some(
      (p) =>
        skip.has(p) ||
        p.startsWith(".env") ||
        /\.(?:pem|key|p12|pfx|zip|tar|gz)$/.test(p) ||
        /^connection-.*\.json$/.test(p),
    )
try {
  for (const path of allowed)
    await cp(join(root, path), join(stage, path), {
      recursive: true,
      filter,
      errorOnExist: true,
      force: false,
    })
  const files = []
  async function walk(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isSymbolicLink())
        throw Error("Release artifacts reject symlinks")
      if (entry.isDirectory()) await walk(join(dir, entry.name), path)
      else
        files.push({
          path,
          sha256: createHash("sha256")
            .update(await readFile(join(dir, entry.name)))
            .digest("hex"),
        })
    }
  }
  await walk(stage)
  files.sort((a, b) => a.path.localeCompare(b.path))
  await writeFile(
    join(stage, "RELEASE_MANIFEST.json"),
    `${JSON.stringify({ version: pkg.version, files }, null, 2)}\n`,
  )
  const tar = spawnSync("tar", ["-czf", archive, "-C", stage, "."], {
    stdio: "inherit",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  })
  if (tar.status !== 0) throw Error("Release archive creation failed")
  const digest = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex")
  await writeFile(
    `${archive}.sha256`,
    `${digest}  framer-plus-${pkg.version}.tar.gz\n`,
  )
  console.log(archive)
} finally {
  await rm(stage, { recursive: true, force: true })
}
