import assert from "node:assert/strict"
import { test } from "node:test"
import type { AnyNode } from "@framer/plugin"
import { createEditorApi } from "../src/framer/api.js"

test("native SDK boundary converts frozen nodes, style/image objects and dimensions into data", async () => {
  const native = Object.freeze({
    __class: "FrameNode",
    id: "native-frame",
    name: "Hero",
    originalId: null,
    isReplica: false,
    locked: false,
    position: "relative",
    width: "1fr",
    height: "fit-content",
    minWidth: null,
    maxWidth: "100%",
    minHeight: null,
    maxHeight: null,
    layout: "stack",
    gap: "10px 20px",
    padding: "1px 2px 3px 4px",
    stackDirection: "horizontal",
    stackAlignment: "center",
    stackDistribution: "start",
    opacity: 1,
    visible: true,
    overflow: null,
    isBreakpoint: false,
    isPrimaryBreakpoint: false,
    isVariant: false,
    inheritsFromId: null,
    backgroundColor: Object.freeze({
      id: "style-id",
      name: "Brand",
      light: "rgba(1, 2, 3, 1)",
      dark: null,
      setAttributes: () => {
        throw new Error("Runtime method must not be serialized")
      },
    }),
    backgroundImage: Object.freeze({
      id: "image-id",
      url: "https://example.com/image.png",
      thumbnailUrl: "https://example.com/thumb.png",
    }),
    getParent: async () => null,
    getChildren: async () => [],
    setAttributes: async () => native,
  }) as unknown as AnyNode
  const api = createEditorApi({
    getNode: async () => native,
    getSelection: async () => [native],
    getCanvasRoot: async () => native,
    getProjectInfo: async () => ({ id: "hashed", name: "Project" }),
    isAllowedTo: () => true,
  })
  const result = await api.getNode("native-frame")
  assert.ok(result)
  assert.equal(result.layout?.width?.mode, "fill")
  assert.equal(result.layout?.gap, "10px 20px")
  assert.equal(result.layout?.overflow, undefined)
  assert.deepEqual(result.visual?.background, {
    kind: "style",
    id: "style-id",
    name: "Brand",
    light: "rgba(1, 2, 3, 1)",
    dark: null,
  })
  assert.deepEqual(result.visual?.image, {
    id: "image-id",
    url: "https://example.com/image.png",
  })
  assert.equal(JSON.stringify(result.visual).includes("setAttributes"), false)
})

test("native project boundary uses documented control, style and CMS patch calls", async () => {
  const { createProjectApi } = await import("../src/framer/project-api.js")
  const calls: Array<unknown> = []
  const frame = {
    __class: "FrameNode",
    id: "frame",
    isReplica: false,
    originalId: null,
    getParent: async () => null,
    getChildren: async () => [],
    setAttributes: async (value: unknown) => {
      calls.push(value)
      return frame
    },
  }
  const color = Object.freeze({
    id: "brand",
    name: "Brand",
    light: "rgba(0,0,0,1)",
    dark: null,
  })
  const item = Object.freeze({
    id: "item",
    slug: "article",
    draft: true,
    fieldData: { title: { type: "string", value: "Before" } },
    setAttributes: async (value: unknown) => {
      calls.push(value)
      return item
    },
  })
  const collection = Object.freeze({
    id: "articles",
    name: "Articles",
    managedBy: "user",
    getFields: async () => [
      {
        id: "title",
        name: "Title",
        type: "string",
        required: true,
        basedOn: null,
      },
    ],
    getItems: async () => [item],
  })
  const native = {
    getNode: async () => frame,
    getNodesWithType: async () => [],
    getNodesWithAttributeSet: async () => [],
    getColorStyles: async () => [color],
    getColorStyle: async () => color,
    getTextStyles: async () => [],
    getTextStyle: async () => null,
    getCollections: async () => [collection],
    getCollection: async () => collection,
    getActiveBranch: async () => ({
      id: "main",
      title: "Main",
      hasJoined: true,
    }),
    isAllowedTo: () => true,
  } as unknown as import("../src/framer/project-api.js").NativeProjectApi
  const project = createProjectApi(native)
  assert.equal(await project.bindStyle("frame", "color", "brand"), true)
  assert.deepEqual(calls[0], { backgroundColor: color })
  const cms = await project.getCollection("articles")
  assert.ok(cms)
  const items = await cms.getItems()
  const first = items[0]
  assert.ok(first)
  await first.setFields({ title: { type: "string", value: "After" } })
  assert.deepEqual(calls[1], {
    fieldData: { title: { type: "string", value: "After" } },
  })
  assert.deepEqual(await cms.getFields(), [
    {
      id: "title",
      name: "Title",
      type: "string",
      required: true,
      basedOn: null,
    },
  ])
  assert.deepEqual(await project.getBranch(), {
    id: "main",
    title: "Main",
    baseId: null,
    joined: true,
  })
  const controls = { label: "Before", bound: { id: "variable" } }
  const instance = {
    ...frame,
    __class: "ComponentInstanceNode",
    componentIdentifier: "module",
    componentName: "Button",
    controls,
  }
  const editor = createEditorApi({
    getNode: async () => instance as unknown as AnyNode,
    getSelection: async () => [],
    getCanvasRoot: async () => instance as unknown as AnyNode,
    getProjectInfo: async () => ({ id: "project", name: "Project" }),
    isAllowedTo: () => true,
  })
  const wrapped = await editor.getNode("frame")
  assert.ok(wrapped?.setControls)
  await wrapped.setControls({ label: "After" })
  assert.deepEqual(calls[2], { controls: { label: "After" } })
})
