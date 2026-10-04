import { EditorAdapter } from "../../src/framer/adapter.js"
import {
  dimension,
  type EditableAttributes,
  type EditorApi,
  type EditorNode,
} from "../../src/framer/api.js"

export const TEST_SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
export function editorFixture() {
  type State = {
    node: Omit<
      EditorNode,
      "readParent" | "readChildren" | "readText" | "setAttributes" | "setText"
    >
    parent: string | null
    children: string[]
    text?: string
  }
  const state = new Map<string, State>()
  const writes: Array<{
    id: string
    attributes?: EditableAttributes
    text?: string
  }> = []
  const permissions = { attributes: true, text: true }
  const hooks: {
    beforeWrite?: () => Promise<void>
    failAfterWrite?: boolean
    mutateOriginal?: boolean
  } = {}
  function add(
    id: string,
    parent: string | null,
    framerType = "FrameNode",
    extra: Partial<State["node"]> = {},
    text?: string,
  ) {
    const node: State["node"] = {
      id,
      framerType,
      name: id,
      isReplica: false,
      originalId: null,
      ...(framerType === "FrameNode" || framerType === "TextNode"
        ? {
            layout: {
              width: dimension("1fr"),
              height: dimension("fit-content"),
              ...(framerType === "FrameNode"
                ? {
                    kind: "stack" as const,
                    gap: "20px",
                    padding: "0px",
                    direction: "vertical" as const,
                    alignment: "start" as const,
                  }
                : {}),
            },
            visual: {
              opacity: 1,
              ...(framerType === "FrameNode"
                ? {
                    background: {
                      kind: "literal" as const,
                      value: "rgba(0, 0, 0, 1)",
                    },
                  }
                : {}),
            },
          }
        : {}),
      ...extra,
    }
    state.set(id, {
      node,
      parent,
      children: [],
      ...(text !== undefined ? { text } : {}),
    })
    if (parent) state.get(parent)?.children.push(id)
  }
  add("page", null, "WebPageNode", { path: "/" })
  add("desktop", "page", "FrameNode", {
    isVariant: true,
    isBreakpoint: true,
    isPrimaryBreakpoint: true,
    layout: {
      width: dimension("1200px"),
      height: dimension("fit-content"),
      kind: "none",
    },
  })
  add("tablet", "page", "FrameNode", {
    isVariant: true,
    isBreakpoint: true,
    isPrimaryBreakpoint: false,
    inheritsFromId: "desktop",
    layout: { width: dimension("768px"), kind: "none" },
  })
  add("phone", "page", "FrameNode", {
    isVariant: true,
    isBreakpoint: true,
    isPrimaryBreakpoint: false,
    inheritsFromId: "desktop",
    layout: { width: dimension("390px"), kind: "none" },
  })
  add("hero", "desktop")
  add("title", "hero", "TextNode", {}, "Hello")
  add("tablet-hero", "tablet", "FrameNode", {
    isReplica: true,
    originalId: "hero",
  })
  add("phone-hero", "phone", "FrameNode", {
    isReplica: true,
    originalId: "hero",
  })
  add(
    "phone-title",
    "phone-hero",
    "TextNode",
    { isReplica: true, originalId: "title" },
    "Hello",
  )
  add("future", "hero", "UnknownNode")

  function wrap(id: string): EditorNode | null {
    const record = state.get(id)
    if (!record) return null
    const raw = structuredClone(record.node)
    return {
      ...raw,
      readParent: async () => (record.parent ? wrap(record.parent) : null),
      readChildren: async () =>
        record.children
          .map((child) => wrap(child))
          .filter((child) => child !== null),
      ...(record.text !== undefined
        ? {
            readText: async () => record.text ?? null,
            setText: async (text: string) => {
              await hooks.beforeWrite?.()
              writes.push({ id, text })
              record.text = text
              if (hooks.failAfterWrite)
                throw new Error("Native failure after side effect")
            },
          }
        : {}),
      setAttributes: async (update) => {
        await hooks.beforeWrite?.()
        writes.push({ id, attributes: update })
        if (update.name !== undefined) record.node.name = update.name
        record.node.layout ??= {}
        if (update.width !== undefined)
          record.node.layout.width = dimension(update.width)
        if (update.height !== undefined)
          record.node.layout.height = dimension(update.height)
        if (update.gap !== undefined) record.node.layout.gap = update.gap
        if (update.padding !== undefined)
          record.node.layout.padding = update.padding
        if (update.stackAlignment !== undefined)
          record.node.layout.alignment = update.stackAlignment
        record.node.visual ??= {}
        if (update.opacity !== undefined)
          record.node.visual.opacity = update.opacity
        if (
          update.backgroundColor !== undefined &&
          (typeof update.backgroundColor === "string" ||
            update.backgroundColor === null)
        )
          record.node.visual.background =
            update.backgroundColor === null
              ? { kind: "none" }
              : { kind: "literal", value: update.backgroundColor }
        if (hooks.mutateOriginal) {
          const original = state.get("hero")
          if (original?.node.visual) original.node.visual.opacity = 0.1
        }
        if (hooks.failAfterWrite)
          throw new Error("Native failure after side effect")
        return true
      },
    }
  }
  let canvasId = "page"
  const api: EditorApi = {
    getNode: async (id) => wrap(id),
    getSelection: async () => [wrap("title")].filter((node) => node !== null),
    getProjectInfo: async () => ({ id: "hashed-project-id", name: "Fixture" }),
    getCanvasRoot: async () => {
      const node = wrap(canvasId)
      if (!node) throw new Error("Missing canvas")
      return node
    },
    canSetAttributes: () => permissions.attributes,
    canSetText: () => permissions.text,
  }
  return {
    api,
    adapter: new EditorAdapter(api, TEST_SESSION),
    state,
    writes,
    permissions,
    hooks,
    add,
    setCanvas: (id: string) => {
      canvasId = id
    },
  }
}
