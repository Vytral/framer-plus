import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const pkg = JSON.parse(await readFile("package.json", "utf8"))
const archive = resolve(
  process.argv[2] ?? `build/releases/framer-plus-${pkg.version}.tar.gz`,
)
const digest = (data) => createHash("sha256").update(data).digest("hex")
const sidecar = (await readFile(`${archive}.sha256`, "utf8")).trim()
if (sidecar.split(/\s+/)[0] !== digest(await readFile(archive)))
  throw Error("Archive checksum mismatch")
const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" })
const types = spawnSync("tar", ["-tvzf", archive], { encoding: "utf8" })
if (listing.status !== 0 || types.status !== 0) throw Error("Invalid archive")
const names = listing.stdout.trim().split("\n")
if (new Set(names).size !== names.length)
  throw Error("Duplicate archive entries")
for (const name of names) {
  if (
    name.startsWith("/") ||
    name.split("/").includes("..") ||
    /[\\\r\n]/.test(name)
  )
    throw Error("Unsafe archive path")
  if (
    /(^|\/)(node_modules|\.git|\.claude|\.codex|__MACOSX|\.env[^/]*|connection-[^/]*\.json)(\/|$)|\.(pem|key|p12|pfx|zip|tar|gz)$/.test(
      name,
    )
  )
    throw Error("Private or unintended archive entry")
}
if (
  types.stdout
    .trim()
    .split("\n")
    .some((line) => !["-", "d"].includes(line[0]))
)
  throw Error("Archive contains links or special files")
const stage = await mkdtemp(join(tmpdir(), "framer-plus-verify-"))
try {
  const extraction = spawnSync("tar", ["-xzf", archive, "-C", stage], {
    stdio: "inherit",
  })
  if (extraction.status !== 0) throw Error("Extraction failed")
  const manifest = JSON.parse(
    await readFile(join(stage, "RELEASE_MANIFEST.json"), "utf8"),
  )
  if (manifest.version !== pkg.version) throw Error("Manifest version mismatch")
  const expected = new Map(
    manifest.files.map((item) => [item.path, item.sha256]),
  )
  if (expected.size !== manifest.files.length)
    throw Error("Duplicate manifest paths")
  let count = 0
  async function verify(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await verify(join(dir, entry.name), path)
        continue
      }
      if (!entry.isFile()) throw Error("Unexpected file type")
      if (path === "RELEASE_MANIFEST.json") continue
      const data = await readFile(join(dir, entry.name))
      if (expected.get(path) !== digest(data))
        throw Error(`Manifest mismatch: ${path}`)
      if (
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(
          data.toString("utf8"),
        )
      )
        throw Error(`Credential material detected: ${path}`)
      expected.delete(path)
      count++
    }
  }
  await verify(stage)
  if (expected.size) throw Error("Manifest references missing files")
  console.log(
    `Verified archive checksum, ${count} file hashes, safe paths/types and credential exclusions.`,
  )
} finally {
  await rm(stage, { recursive: true, force: true })
}
