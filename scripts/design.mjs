#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import {
  compareDesigns,
  designIRSchema,
  generateReact,
  regenerateProject,
  toDesignIR,
  writeNewProject,
} from "../packages/design/dist/index.js"

const [command, input, output, ...rest] = process.argv.slice(2)
const json = async (path) => JSON.parse(await readFile(path, "utf8"))
try {
  switch (command) {
    case "ir":
      if (!input || !output)
        throw Error("Usage: pnpm design ir snapshot.json ir.json [roles.json]")
      await writeFile(
        output,
        `${JSON.stringify(
          toDesignIR(await json(input), rest[0] ? await json(rest[0]) : {}),
          null,
          2,
        )}\n`,
        { flag: "wx", mode: 0o600 },
      )
      break
    case "react":
      if (!input || !output)
        throw Error(
          "Usage: pnpm design react ir.json new-directory [options.json]",
        )
      console.log(
        await writeNewProject(
          output,
          generateReact(await json(input), rest[0] ? await json(rest[0]) : {})
            .files,
        ),
      )
      break
    case "compare":
      if (!input || !output)
        throw Error("Usage: pnpm design compare before-ir.json after-ir.json")
      console.log(
        JSON.stringify(
          compareDesigns(
            designIRSchema.parse(await json(input)),
            designIRSchema.parse(await json(output)),
          ),
          null,
          2,
        ),
      )
      break
    case "regenerate":
      if (!input || !output || !rest[0])
        throw Error(
          "Usage: pnpm design regenerate ir.json previous-directory new-directory [options.json]",
        )
      console.log(
        JSON.stringify(
          await regenerateProject(
            output,
            generateReact(
              await json(input),
              rest[1] ? await json(rest[1]) : {},
            ),
            rest[0],
          ),
          null,
          2,
        ),
      )
      break
    default:
      throw Error(
        "Commands: ir, react, compare, regenerate. Build the workspace first.",
      )
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Design command failed",
  )
  if (error && typeof error === "object" && "diagnostics" in error)
    console.error(JSON.stringify(error.diagnostics, null, 2))
  process.exitCode = 1
}
