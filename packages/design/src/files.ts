import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import {
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  rmdir,
} from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { hash } from "./ir.js"
import type { GeneratedProject } from "./react.js"
import { type GeneratedManifest, generatedManifestSchema } from "./schema.js"
export function validatePath(path: string) {
  if (
    !/^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(path) ||
    path
      .split("/")
      .some(
        (s) =>
          s === "." ||
          s === ".." ||
          ["__proto__", "constructor", "prototype"].includes(s),
      ) ||
    path.length > 200
  )
    throw Error("Unsafe artifact path")
}
export async function readPlainFile(
  path: string,
  maxBytes = 8 * 1024 * 1024,
): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > maxBytes)
      throw Error("Expected a bounded regular artifact file")
    return await file.readFile("utf8")
  } finally {
    await file.close()
  }
}
export async function writeNewProject(
  target: string,
  files: Record<string, string>,
) {
  const destination = resolve(target)
  const parent = dirname(destination)
  await mkdir(parent, { recursive: true })
  const stage = join(parent, `.framer-plus-stage-${randomUUID()}`)
  await mkdir(stage, { mode: 0o700 })
  let claimed = false
  try {
    for (const [path, content] of Object.entries(files)) {
      validatePath(path)
      const absolute = join(stage, path)
      await mkdir(dirname(absolute), { recursive: true, mode: 0o700 })
      const file = await open(absolute, "wx", 0o600)
      try {
        await file.writeFile(content)
      } finally {
        await file.close()
      }
    }
    await mkdir(destination, { mode: 0o700 })
    claimed = true
    await rename(stage, destination)
    claimed = false
  } finally {
    await rm(stage, { recursive: true, force: true })
    if (claimed)
      try {
        await rmdir(destination)
      } catch {}
  }
  return destination
}
export async function readProject(directory: string) {
  const root = resolve(directory)
  const stat = await lstat(root)
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error("Expected a plain project directory")
  const files: Record<string, string> = {}
  let size = 0
  async function walk(relative: string) {
    if (relative.split("/").length > 16)
      throw Error("Project nesting exceeds regeneration limit")
    for (const entry of await readdir(join(root, relative), {
      withFileTypes: true,
    })) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue
      const path = relative ? `${relative}/${entry.name}` : entry.name
      validatePath(path)
      if (entry.isSymbolicLink()) throw Error("Regeneration rejects symlinks")
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) {
        if (Object.keys(files).length >= 1000)
          throw Error("Too many project files")
        const text = await readPlainFile(join(root, path), 1024 * 1024)
        size += Buffer.byteLength(text)
        if (size > 20 * 1024 * 1024)
          throw Error("Project exceeds regeneration budget")
        files[path] = text
      } else throw Error("Unsupported filesystem entry")
    }
  }
  await walk("")
  return files
}
export function planRegeneration(
  previous: GeneratedManifest,
  current: Record<string, string>,
  next: GeneratedProject,
) {
  const old = generatedManifestSchema.parse(previous)
  if (
    old.projectId !== next.manifest.projectId ||
    old.branchId !== next.manifest.branchId
  )
    throw Error("Regeneration requires the same source project and branch")
  const conflicts: string[] = []
  const output: Record<string, string> = { ...current }
  delete output[".framer-plus.json"]
  for (const [path, baseline] of Object.entries(old.files)) {
    validatePath(path)
    const actual = current[path]
    const upcoming = next.files[path]
    const upstreamChanged =
      upcoming === undefined || hash(upcoming) !== baseline
    const userChanged = actual === undefined || hash(actual) !== baseline
    if (upstreamChanged && userChanged) conflicts.push(path)
    else if (upstreamChanged) {
      if (upcoming === undefined) delete output[path]
      else output[path] = upcoming
    }
  }
  for (const [path, content] of Object.entries(next.files)) {
    if (path === ".framer-plus.json") continue
    if (!(path in old.files)) {
      if (path in current && current[path] !== content) conflicts.push(path)
      else output[path] = content
    }
  }
  if (conflicts.length) return { conflicts: conflicts.sort(), files: null }
  output[".framer-plus.json"] =
    next.files[".framer-plus.json"] ??
    `${JSON.stringify(next.manifest, null, 2)}\n`
  return { conflicts: [], files: output }
}
export async function regenerateProject(
  previousDirectory: string,
  next: GeneratedProject,
  newDirectory: string,
) {
  if (resolve(previousDirectory) === resolve(newDirectory))
    throw Error(
      "Regeneration requires a new destination; the previous working directory remains untouched",
    )
  const current = await readProject(previousDirectory)
  const raw = current[".framer-plus.json"]
  if (!raw) throw Error("Missing generated-file baseline manifest")
  const planned = planRegeneration(
    generatedManifestSchema.parse(JSON.parse(raw)),
    current,
    next,
  )
  if (!planned.files)
    return { status: "conflict" as const, conflicts: planned.conflicts }
  const path = await writeNewProject(newDirectory, planned.files)
  return { status: "generated" as const, path, conflicts: [] }
}
export function projectLabel(path: string) {
  return basename(resolve(path))
}
