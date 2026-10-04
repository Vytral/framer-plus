import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { lstat, mkdir, open, realpath } from "node:fs/promises"
import { join, resolve } from "node:path"
import {
  canonical,
  type DesignIR,
  type DesignSnapshot,
  designIRSchema,
  type ExportOptions,
  generatedManifestSchema,
  generateReact,
  hash,
  readPlainFile,
  regenerateProject,
  snapshotSchema,
  writeNewProject,
} from "@framer-plus/design"
import { z } from "zod"

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const uuid = z.string().uuid()
const exportRecordSchema = z
  .object({ id: uuid, snapshotId: digest, manifest: generatedManifestSchema })
  .strict()
export class ArtifactStore {
  constructor(readonly directory: string) {}
  private async root() {
    const path = resolve(this.directory)
    await mkdir(path, { recursive: true, mode: 0o700 })
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw Error("Artifact root must be a plain directory")
    return realpath(path)
  }
  private async writeJSON(name: string, value: unknown) {
    const root = await this.root()
    const content = `${canonical(value)}\n`
    try {
      const file = await open(
        join(root, name),
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      )
      try {
        await file.writeFile(content)
      } finally {
        await file.close()
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      if ((await readPlainFile(join(root, name))) !== content)
        throw Error("Artifact identity collision or altered artifact")
    }
    return join(root, name)
  }
  async save(snapshot: DesignSnapshot, ir: DesignIR) {
    const id = hash(canonical({ snapshot, ir }))
    await this.writeJSON(`snapshot-${id}.json`, { snapshot, ir })
    return { id, path: join(await this.root(), `snapshot-${id}.json`) }
  }
  async load(id: string) {
    digest.parse(id)
    const text = await readPlainFile(
      join(await this.root(), `snapshot-${id}.json`),
    )
    const parsed = z
      .object({ snapshot: snapshotSchema, ir: designIRSchema })
      .strict()
      .parse(JSON.parse(text))
    if (hash(canonical(parsed)) !== id)
      throw Error("Snapshot artifact was altered")
    return parsed
  }
  async generate(snapshotId: string, options: ExportOptions) {
    const { ir } = await this.load(snapshotId)
    const project = generateReact(ir, options)
    const id = randomUUID()
    const path = await writeNewProject(
      join(await this.root(), `export-${id}`),
      project.files,
    )
    await this.writeJSON(`export-${id}.json`, {
      id,
      snapshotId,
      manifest: project.manifest,
    })
    return { id, path, manifest: project.manifest }
  }
  async exportRecord(id: string) {
    uuid.parse(id)
    return exportRecordSchema.parse(
      JSON.parse(
        await readPlainFile(join(await this.root(), `export-${id}.json`)),
      ),
    )
  }
  async regenerate(
    previousId: string,
    snapshotId: string,
    options: ExportOptions,
  ) {
    const previous = await this.exportRecord(previousId)
    const { ir } = await this.load(snapshotId)
    const project = generateReact(ir, options)
    if (
      project.manifest.projectId !== previous.manifest.projectId ||
      project.manifest.branchId !== previous.manifest.branchId
    )
      throw Error("Regeneration requires the same project and branch")
    const root = await this.root()
    const previousPath = join(root, `export-${previousId}`)
    const baseline = generatedManifestSchema.parse(
      JSON.parse(await readPlainFile(join(previousPath, ".framer-plus.json"))),
    )
    if (canonical(baseline) !== canonical(previous.manifest))
      throw Error("Regeneration baseline manifest was altered")
    const id = randomUUID()
    const output = await regenerateProject(
      previousPath,
      project,
      join(root, `export-${id}`),
    )
    if (output.status === "conflict") return output
    await this.writeJSON(`export-${id}.json`, {
      id,
      snapshotId,
      manifest: project.manifest,
    })
    return { ...output, id, manifest: project.manifest }
  }
}
